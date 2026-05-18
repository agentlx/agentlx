import { createHash, randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import type {
  AuthViewer,
  ChangePasswordInput,
  CreateUserInput,
  LoginMfaChallenge,
  MfaCodeInput,
  MfaSetupView,
  ResetUserMfaInput,
  ScreenPermission,
  UpdateProfilePhotoInput,
  UpdateUserInput,
  UserListItem,
  UserRole,
} from "@/lib/auth";
import {
  getAccessibleScreensForRole,
  getAllScreenPermissions,
  normalizeAllowedScreens,
  profilePhotoAllowedMimeTypes,
  profilePhotoMaxBytes,
  profilePhotoMaxSizeLabel,
} from "@/lib/auth";
import { appendAuditLog } from "./audit.server";
import { dbQuery, withTransaction } from "./db.server";
import { getEnv } from "./env.server";
import {
  assessTotpToken,
  buildTotpOtpAuthUrl,
  createTotpSecret,
  decryptMfaPayload,
  encryptMfaPayload,
  encryptMfaSecret,
  resolveStoredMfaSecret,
} from "./mfa.server";
import { hashPassword, verifyPassword } from "./password.server";

const SESSION_COOKIE_NAME = "agentlx_session";
const MFA_PENDING_COOKIE_NAME = "agentlx_mfa_pending";
const MFA_SETUP_COOKIE_NAME = "agentlx_mfa_setup";
const SESSION_TTL_DAYS = 14;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  allowed_screens: unknown;
  mfa_secret: string | null;
  mfa_enabled: boolean;
  profile_photo_mime: string | null;
  profile_photo_data?: string | null;
  profile_photo_width: number | null;
  profile_photo_height: number | null;
  profile_photo_updated_at: string | null;
  disabled: boolean;
  session_version: number;
  created_at: string;
  updated_at: string;
};

type SessionRow = UserRow & {
  session_id: string;
  session_version_at_issue: number;
  session_last_seen_at: string;
  session_expires_at: string;
};

type MfaPendingPayload = {
  userId: string;
  sessionVersion: number;
  email: string;
  fullName: string;
};

type MfaSetupPayload = {
  userId: string;
  sessionVersion: number;
  secret: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseAllowedScreens(value: unknown): ScreenPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is ScreenPermission =>
      typeof item === "string" && getAllScreenPermissions().includes(item as ScreenPermission),
  );
}

function isUserMfaConfigured(row: Pick<UserRow, "mfa_enabled" | "mfa_secret">) {
  return Boolean(row.mfa_enabled && row.mfa_secret);
}

function isAllowedProfilePhotoMime(
  mime: string,
): mime is (typeof profilePhotoAllowedMimeTypes)[number] {
  return profilePhotoAllowedMimeTypes.includes(
    mime as (typeof profilePhotoAllowedMimeTypes)[number],
  );
}

function hasExpectedProfilePhotoSignature(mime: string, buffer: Buffer) {
  if (mime === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (mime === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return false;
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const markerLength = buffer.readUInt16BE(offset + 2);

    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      ) &&
      offset + 9 < buffer.length
    ) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    if (markerLength < 2) {
      break;
    }

    offset += markerLength + 2;
  }

  return null;
}

function parseProfilePhotoDataUrl(imageDataUrl: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
  if (!match) {
    throw new Error("Envie uma imagem PNG ou JPEG valida.");
  }

  const mime = match[1];
  const base64 = match[2];
  if (!mime || !base64) {
    throw new Error("Envie uma imagem PNG ou JPEG valida.");
  }

  if (!isAllowedProfilePhotoMime(mime)) {
    throw new Error("A foto precisa estar em PNG ou JPEG.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new Error("Nao foi possivel ler a imagem enviada.");
  }

  if (buffer.length === 0 || buffer.length > profilePhotoMaxBytes) {
    throw new Error(`A foto precisa ter no maximo ${profilePhotoMaxSizeLabel}.`);
  }

  const normalizedBase64 = base64.replace(/=+$/, "");
  const encodedBase64 = buffer.toString("base64");
  if (encodedBase64 !== base64 && encodedBase64.replace(/=+$/, "") !== normalizedBase64) {
    throw new Error("Nao foi possivel validar a imagem enviada.");
  }

  if (!hasExpectedProfilePhotoSignature(mime, buffer)) {
    throw new Error("O conteudo da imagem nao corresponde ao formato informado.");
  }

  const dimensions = mime === "image/png" ? readPngDimensions(buffer) : readJpegDimensions(buffer);
  if (!dimensions) {
    throw new Error("Nao foi possivel validar as dimensoes da foto enviada.");
  }

  if (dimensions.width !== 512 || dimensions.height !== 512) {
    throw new Error("A foto precisa estar normalizada em 512x512px.");
  }

  return {
    mime,
    base64: buffer.toString("base64"),
    byteLength: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function profilePhotoUrl(row: Pick<UserRow, "profile_photo_mime" | "profile_photo_updated_at">) {
  if (!row.profile_photo_mime || !row.profile_photo_updated_at) {
    return null;
  }

  if (!isAllowedProfilePhotoMime(row.profile_photo_mime)) {
    return null;
  }

  return `/api/profile-photo?v=${encodeURIComponent(row.profile_photo_updated_at)}`;
}

function toViewer(
  row: Pick<
    UserRow,
    | "id"
    | "full_name"
    | "email"
    | "role"
    | "allowed_screens"
    | "mfa_enabled"
    | "mfa_secret"
    | "disabled"
    | "profile_photo_mime"
    | "profile_photo_updated_at"
  >,
): AuthViewer {
  const allowedScreens = normalizeAllowedScreens(
    row.role,
    parseAllowedScreens(row.allowed_screens),
  );
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    allowedScreens,
    accessibleScreens: getAccessibleScreensForRole(row.role, allowedScreens),
    mfaEnabled: isUserMfaConfigured(row),
    disabled: row.disabled,
    profilePhotoUrl: profilePhotoUrl(row),
    profilePhotoUpdatedAt: row.profile_photo_updated_at,
  };
}

function toUserListItem(row: UserRow): UserListItem {
  const viewer = toViewer(row);
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    allowedScreens: viewer.allowedScreens,
    accessibleScreens: viewer.accessibleScreens,
    mfaEnabled: viewer.mfaEnabled,
    disabled: row.disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cookieOptions(expires: Date) {
  const env = getEnv();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production" || env.APP_ORIGIN.startsWith("https://"),
    path: "/",
    expires,
  };
}

function mfaCookieOptions(ttlMinutes: number) {
  return cookieOptions(new Date(Date.now() + ttlMinutes * 60 * 1000));
}

function setEncryptedCookie(name: string, payload: unknown, ttlMinutes: number) {
  setCookie(name, encryptMfaPayload(payload), mfaCookieOptions(ttlMinutes));
}

function readEncryptedCookie<T>(name: string): T | null {
  const value = getCookie(name);
  if (!value) {
    return null;
  }

  try {
    return decryptMfaPayload<T>(value);
  } catch {
    deleteCookie(name, { path: "/" });
    return null;
  }
}

function clearMfaCookies() {
  deleteCookie(MFA_PENDING_COOKIE_NAME, { path: "/" });
  deleteCookie(MFA_SETUP_COOKIE_NAME, { path: "/" });
}

function buildMfaCodeErrorMessage(reason: "invalid" | "expired" | "valid") {
  if (reason === "expired") {
    return "Codigo do autenticador expirado. Aguarde o proximo codigo e tente novamente.";
  }

  return "Codigo do autenticador invalido.";
}

function auditClient() {
  return {
    query: <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
      dbQuery<T>(text, params),
  };
}

async function countRecentFailedLogins(email: string, ipAddress: string, since: string) {
  const result = await dbQuery<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_logs
      WHERE action = 'auth.login.failed'
        AND created_at >= $1
        AND (
          (($2 <> '') AND COALESCE(metadata_json->>'email', '') = $2)
          OR (($3 <> '') AND COALESCE(metadata_json->>'ipAddress', '') = $3)
        )
    `,
    [since, email, ipAddress],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function hasRecentFailedLoginAlert(email: string, ipAddress: string, since: string) {
  const result = await dbQuery<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_logs
      WHERE action = 'auth.login.alert'
        AND created_at >= $1
        AND (
          (($2 <> '') AND COALESCE(metadata_json->>'email', '') = $2)
          OR (($3 <> '') AND COALESCE(metadata_json->>'ipAddress', '') = $3)
        )
    `,
    [since, email, ipAddress],
  );

  return Number(result.rows[0]?.count ?? 0) > 0;
}

async function countRecentFailedMfa(userId: string, ipAddress: string, since: string) {
  const result = await dbQuery<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_logs
      WHERE action = 'auth.mfa.failed'
        AND created_at >= $1
        AND COALESCE(metadata_json->>'userId', '') = $2
        AND COALESCE(metadata_json->>'ipAddress', '') = $3
    `,
    [since, userId, ipAddress],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function recordFailedLoginAttempt(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const ipAddress = getRequestIP({ xForwardedFor: true }) ?? "";
  const userAgent = getRequestHeader("user-agent") ?? "";
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  await appendAuditLog(auditClient(), {
    actorType: "system",
    actorId: ipAddress || normalizedEmail || "unknown",
    action: "auth.login.failed",
    severity: "warn",
    message: `Falha de login para ${normalizedEmail || "conta desconhecida"}.`,
    createdAt: now,
    metadata: {
      alert: false,
      email: normalizedEmail,
      ipAddress,
      userAgent,
    },
  });

  const failures = await countRecentFailedLogins(normalizedEmail, ipAddress, since);
  if (failures < 5) {
    return;
  }

  const alreadyAlerted = await hasRecentFailedLoginAlert(normalizedEmail, ipAddress, since);
  if (alreadyAlerted) {
    return;
  }

  await appendAuditLog(auditClient(), {
    actorType: "system",
    actorId: ipAddress || normalizedEmail || "unknown",
    action: "auth.login.alert",
    severity: "critical",
    message: `Muitas falhas de login detectadas para ${normalizedEmail || "conta desconhecida"}.`,
    createdAt: now,
    metadata: {
      alert: true,
      failures,
      email: normalizedEmail,
      ipAddress,
      userAgent,
      windowMinutes: 15,
    },
  });
}

function readCookieTokenFromHeader(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    return decodeURIComponent(rest.join("="));
  }

  return null;
}

async function findUserByEmail(email: string) {
  const result = await dbQuery<UserRow>(
    `
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        allowed_screens,
        mfa_secret,
        mfa_enabled,
        profile_photo_mime,
        profile_photo_width,
        profile_photo_height,
        profile_photo_updated_at,
        disabled,
        session_version,
        created_at,
        updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizeEmail(email)],
  );

  return result.rows[0] ?? null;
}

async function findUserById(userId: string) {
  const result = await dbQuery<UserRow>(
    `
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        allowed_screens,
        mfa_secret,
        mfa_enabled,
        profile_photo_mime,
        profile_photo_width,
        profile_photo_height,
        profile_photo_updated_at,
        disabled,
        session_version,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

async function getSessionRowByToken(token: string) {
  const result = await dbQuery<SessionRow>(
    `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.password_hash,
        u.role,
        u.allowed_screens,
        u.mfa_secret,
        u.mfa_enabled,
        u.profile_photo_mime,
        u.profile_photo_width,
        u.profile_photo_height,
        u.profile_photo_updated_at,
        u.disabled,
        u.session_version,
        u.created_at,
        u.updated_at,
        s.id AS session_id,
        s.session_version AS session_version_at_issue,
        s.last_seen_at AS session_last_seen_at,
        s.expires_at AS session_expires_at
      FROM user_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
      LIMIT 1
    `,
    [hashToken(token)],
  );

  return result.rows[0] ?? null;
}

async function createSessionForUser(
  user: UserRow,
  opts?: { ipAddress?: string; userAgent?: string },
) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await dbQuery(
    `
      INSERT INTO user_sessions (
        id,
        user_id,
        token_hash,
        session_version,
        ip_address,
        user_agent,
        expires_at,
        last_seen_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      randomUUID(),
      user.id,
      tokenHash,
      user.session_version,
      opts?.ipAddress ?? null,
      opts?.userAgent ?? null,
      expiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
    ],
  );

  setCookie(SESSION_COOKIE_NAME, rawToken, cookieOptions(expiresAt));
}

function startPendingMfaLogin(user: UserRow): LoginMfaChallenge {
  const env = getEnv();
  clearMfaCookies();
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
  setEncryptedCookie(
    MFA_PENDING_COOKIE_NAME,
    {
      userId: user.id,
      sessionVersion: user.session_version,
      email: user.email,
      fullName: user.full_name,
    } satisfies MfaPendingPayload,
    env.AGENTLX_MFA_PENDING_TTL_MINUTES,
  );

  return {
    mfaRequired: true,
    pendingMfa: {
      email: user.email,
      fullName: user.full_name,
    },
  };
}

async function deleteSessionByToken(token: string) {
  await dbQuery("DELETE FROM user_sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function getCurrentViewer() {
  const token = getCookie(SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const row = await getSessionRowByToken(token);
  if (!row) {
    deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  if (row.disabled || row.session_version_at_issue !== row.session_version) {
    await deleteSessionByToken(token);
    deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  const expiresAt = new Date(row.session_expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await deleteSessionByToken(token);
    deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  const lastSeenAt = new Date(row.session_last_seen_at).getTime();
  if (Number.isNaN(lastSeenAt) || Date.now() - lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    void dbQuery("UPDATE user_sessions SET last_seen_at = $2 WHERE id = $1", [
      row.session_id,
      new Date().toISOString(),
    ]);
  }

  return toViewer(row);
}

export async function getViewerFromCookieHeader(cookieHeader: string | undefined) {
  const token = readCookieTokenFromHeader(cookieHeader);
  if (!token) {
    return null;
  }

  const row = await getSessionRowByToken(token);
  if (!row) {
    return null;
  }

  const expiresAt = new Date(row.session_expires_at);
  if (
    row.disabled ||
    row.session_version_at_issue !== row.session_version ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  return toViewer(row);
}

export async function getProfilePhotoForViewer(userId: string) {
  const result = await dbQuery<{
    profile_photo_mime: string | null;
    profile_photo_data: string | null;
    profile_photo_updated_at: string | null;
  }>(
    `
      SELECT profile_photo_mime, profile_photo_data, profile_photo_updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  const row = result.rows[0];
  if (!row?.profile_photo_mime || !row.profile_photo_data) {
    return null;
  }

  if (!isAllowedProfilePhotoMime(row.profile_photo_mime)) {
    return null;
  }

  return {
    mime: row.profile_photo_mime,
    data: Buffer.from(row.profile_photo_data, "base64"),
    updatedAt: row.profile_photo_updated_at,
  };
}

export async function requireAuthenticatedViewer() {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    throw new Error("Sessao expirada ou ausente. Faca login novamente.");
  }
  return viewer;
}

export async function requireScreenAccess(screen: ScreenPermission) {
  const viewer = await requireAuthenticatedViewer();
  if (!viewer.accessibleScreens.includes(screen)) {
    throw new Error("Voce nao possui acesso a esta area.");
  }
  return viewer;
}

export async function requireAnyScreenAccess(screens: ScreenPermission[]) {
  const viewer = await requireAuthenticatedViewer();
  if (!screens.some((screen) => viewer.accessibleScreens.includes(screen))) {
    throw new Error("Voce nao possui permissao para executar esta operacao.");
  }
  return viewer;
}

export async function requireAdminViewer() {
  const viewer = await requireAuthenticatedViewer();
  if (viewer.role !== "admin") {
    throw new Error("Esta operacao e restrita a administradores.");
  }
  return viewer;
}

export async function loginUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(email);
  if (!user || user.disabled) {
    await recordFailedLoginAttempt(normalizedEmail);
    throw new Error("Credenciais invalidas.");
  }

  const matches = await verifyPassword(password, user.password_hash);
  if (!matches) {
    await recordFailedLoginAttempt(normalizedEmail);
    throw new Error("Credenciais invalidas.");
  }

  const ipAddress = getRequestIP({ xForwardedFor: true }) ?? "";
  const userAgent = getRequestHeader("user-agent") ?? "";

  if (isUserMfaConfigured(user)) {
    await appendAuditLog(auditClient(), {
      actorType: "panel",
      actorId: user.email,
      action: "auth.mfa.required",
      severity: "notice",
      message: `Login com MFA solicitado para ${user.email}.`,
      metadata: {
        alert: false,
        ipAddress,
        userAgent,
        userId: user.id,
      },
    });

    return startPendingMfaLogin(user);
  }

  clearMfaCookies();
  await createSessionForUser(user, {
    ipAddress: ipAddress || undefined,
    userAgent,
  });

  await appendAuditLog(auditClient(), {
    actorType: "panel",
    actorId: user.email,
    action: "auth.login.succeeded",
    severity: "notice",
    message: `Login concluido para ${user.email}.`,
    metadata: {
      alert: false,
      ipAddress,
      userAgent,
      userId: user.id,
    },
  });

  return toViewer(user);
}

export async function logoutCurrentSession() {
  const token = getCookie(SESSION_COOKIE_NAME);
  if (token) {
    await deleteSessionByToken(token);
  }

  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
  clearMfaCookies();
}

export async function listUsers() {
  await requireAdminViewer();

  const result = await dbQuery<UserRow>(
    `
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        allowed_screens,
        mfa_secret,
        mfa_enabled,
        profile_photo_mime,
        profile_photo_width,
        profile_photo_height,
        profile_photo_updated_at,
        disabled,
        session_version,
        created_at,
        updated_at
      FROM users
      ORDER BY role ASC, full_name ASC, email ASC
    `,
  );

  return result.rows.map(toUserListItem);
}

export async function createUser(input: CreateUserInput) {
  const actor = await requireAdminViewer();

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new Error("Ja existe um usuario com este e-mail.");
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);
  const allowedScreens = normalizeAllowedScreens(input.role, input.allowedScreens);

  await dbQuery(
    `
      INSERT INTO users (
        id,
        full_name,
        email,
        password_hash,
        role,
        allowed_screens,
        mfa_secret,
        mfa_enabled,
        profile_photo_mime,
        profile_photo_width,
        profile_photo_height,
        profile_photo_updated_at,
        disabled,
        session_version,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NULL, FALSE, NULL, NULL, FALSE, 1, $7, $8)
    `,
    [
      randomUUID(),
      input.fullName.trim(),
      normalizeEmail(input.email),
      passwordHash,
      input.role,
      JSON.stringify(allowedScreens),
      now,
      now,
    ],
  );

  await appendAuditLog(auditClient(), {
    actorType: "panel",
    actorId: actor.email,
    action: input.role === "admin" ? "user.admin.created" : "user.created",
    severity: input.role === "admin" ? "critical" : "notice",
    message: `Conta ${actor.email} criou o usuario ${normalizeEmail(input.email)} com role ${input.role}.`,
    metadata: {
      alert: input.role === "admin",
      targetEmail: normalizeEmail(input.email),
      targetRole: input.role,
      allowedScreens: allowedScreens,
    },
  });
}

export async function updateUser(input: UpdateUserInput) {
  const actor = await requireAdminViewer();
  const target = await findUserById(input.userId);
  if (!target) {
    throw new Error("Usuario nao encontrado.");
  }

  if (target.id === actor.id && input.disabled) {
    throw new Error("Voce nao pode desativar a propria conta.");
  }

  const email = normalizeEmail(input.email);
  const duplicate = await findUserByEmail(email);
  if (duplicate && duplicate.id !== target.id) {
    throw new Error("Ja existe um usuario com este e-mail.");
  }

  const now = new Date().toISOString();
  const allowedScreens = normalizeAllowedScreens(input.role, input.allowedScreens);
  const previousAllowedScreens = normalizeAllowedScreens(
    target.role,
    parseAllowedScreens(target.allowed_screens),
  );
  const roleChanged = target.role !== input.role;
  const disabledChanged = target.disabled !== input.disabled;
  const passwordChanged = Boolean(input.password);
  const permissionsChanged =
    JSON.stringify(previousAllowedScreens) !== JSON.stringify(allowedScreens);

  await withTransaction(async (client) => {
    let passwordHash = target.password_hash;
    let sessionVersion = target.session_version;

    if (input.password) {
      passwordHash = await hashPassword(input.password);
      sessionVersion += 1;
    }

    if (target.disabled !== input.disabled) {
      sessionVersion += 1;
    }

    if (roleChanged || permissionsChanged) {
      sessionVersion += 1;
    }

    await client.query(
      `
        UPDATE users
        SET
          full_name = $2,
          email = $3,
          password_hash = $4,
          role = $5,
          allowed_screens = $6::jsonb,
          disabled = $7,
          session_version = $8,
          updated_at = $9
        WHERE id = $1
      `,
      [
        target.id,
        input.fullName.trim(),
        email,
        passwordHash,
        input.role,
        JSON.stringify(allowedScreens),
        input.disabled,
        sessionVersion,
        now,
      ],
    );

    if (sessionVersion !== target.session_version) {
      await client.query("DELETE FROM user_sessions WHERE user_id = $1", [target.id]);
    }

    await appendAuditLog(client, {
      actorType: "panel",
      actorId: actor.email,
      action: roleChanged ? "user.role.changed" : "user.updated",
      severity: roleChanged || disabledChanged ? "warn" : "notice",
      message: `Conta ${actor.email} atualizou o usuario ${email}.${roleChanged ? ` Role: ${target.role} -> ${input.role}.` : ""}${disabledChanged ? ` Estado: ${target.disabled ? "desativado" : "ativo"} -> ${input.disabled ? "desativado" : "ativo"}.` : ""}${passwordChanged ? " Senha redefinida." : ""}`,
      createdAt: now,
      metadata: {
        alert: roleChanged || disabledChanged,
        targetUserId: target.id,
        targetEmail: email,
        previousRole: target.role,
        nextRole: input.role,
        disabledChanged,
        passwordChanged,
        permissionsChanged,
        allowedScreens,
      },
    });
  });
}

export async function changeOwnPassword(input: ChangePasswordInput) {
  const viewer = await requireAuthenticatedViewer();
  const user = await findUserById(viewer.id);
  if (!user) {
    throw new Error("Usuario nao encontrado.");
  }

  const matches = await verifyPassword(input.currentPassword, user.password_hash);
  if (!matches) {
    throw new Error("A senha atual esta incorreta.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE users
        SET password_hash = $2, session_version = session_version + 1, updated_at = $3
        WHERE id = $1
      `,
      [user.id, passwordHash, now],
    );
    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [user.id]);

    await appendAuditLog(client, {
      actorType: "panel",
      actorId: viewer.email,
      action: "user.password.changed",
      severity: "notice",
      message: `Conta ${viewer.email} alterou a propria senha.`,
      createdAt: now,
      metadata: {
        alert: false,
        userId: user.id,
      },
    });
  });

  const refreshed = await findUserById(user.id);
  if (!refreshed) {
    throw new Error("Usuario nao encontrado.");
  }

  await createSessionForUser(refreshed, {
    ipAddress: getRequestIP({ xForwardedFor: true }) ?? undefined,
    userAgent: getRequestHeader("user-agent"),
  });

  return toViewer(refreshed);
}

export async function updateOwnProfilePhoto(input: UpdateProfilePhotoInput) {
  const viewer = await requireAuthenticatedViewer();
  const user = await findUserById(viewer.id);
  if (!user) {
    throw new Error("Usuario nao encontrado.");
  }

  const photo = parseProfilePhotoDataUrl(input.imageDataUrl);
  const now = new Date().toISOString();
  const result = await dbQuery<UserRow>(
    `
      UPDATE users
      SET profile_photo_mime = $2,
          profile_photo_data = $3,
          profile_photo_width = $4,
          profile_photo_height = $5,
          profile_photo_updated_at = $6,
          updated_at = $6
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        password_hash,
        role,
        allowed_screens,
        mfa_secret,
        mfa_enabled,
        profile_photo_mime,
        profile_photo_width,
        profile_photo_height,
        profile_photo_updated_at,
        disabled,
        session_version,
        created_at,
        updated_at
    `,
    [user.id, photo.mime, photo.base64, photo.width, photo.height, now],
  );

  const updated = result.rows[0];
  if (!updated) {
    throw new Error("Usuario nao encontrado.");
  }

  await appendAuditLog(auditClient(), {
    actorType: "panel",
    actorId: viewer.email,
    action: "user.profile_photo.updated",
    severity: "notice",
    message: `Conta ${viewer.email} atualizou a foto de perfil.`,
    createdAt: now,
    metadata: {
      alert: false,
      userId: user.id,
      mime: photo.mime,
      byteLength: photo.byteLength,
    },
  });

  return toViewer(updated);
}

export async function createOwnMfaSetup(): Promise<MfaSetupView> {
  const viewer = await requireAuthenticatedViewer();
  const user = await findUserById(viewer.id);
  if (!user) {
    throw new Error("Usuario nao encontrado.");
  }

  const env = getEnv();
  const secret = createTotpSecret();
  const issuer = env.AGENTLX_MFA_ISSUER;
  const accountName = user.email;
  const otpauthUrl = buildTotpOtpAuthUrl({
    secret,
    accountName,
    issuer,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  setEncryptedCookie(
    MFA_SETUP_COOKIE_NAME,
    {
      userId: user.id,
      sessionVersion: user.session_version,
      secret,
    } satisfies MfaSetupPayload,
    env.AGENTLX_MFA_SETUP_TTL_MINUTES,
  );

  return {
    qrCodeDataUrl,
    manualEntryKey: secret,
    issuer,
    accountName,
  };
}

export async function verifyOwnMfaSetup(input: MfaCodeInput) {
  const viewer = await requireAuthenticatedViewer();
  const setup = readEncryptedCookie<MfaSetupPayload>(MFA_SETUP_COOKIE_NAME);
  if (!setup) {
    throw new Error("Solicite um novo QR Code para continuar.");
  }

  if (setup.userId !== viewer.id) {
    deleteCookie(MFA_SETUP_COOKIE_NAME, { path: "/" });
    throw new Error("Configuracao de MFA invalida para esta sessao.");
  }

  const user = await findUserById(viewer.id);
  if (!user) {
    clearMfaCookies();
    throw new Error("Usuario nao encontrado.");
  }

  if (Number(setup.sessionVersion) !== Number(user.session_version)) {
    clearMfaCookies();
    throw new Error("Sessao de MFA expirada. Solicite um novo QR Code.");
  }

  const assessment = assessTotpToken(setup.secret, input.code);
  if (!assessment.valid) {
    throw new Error(buildMfaCodeErrorMessage(assessment.reason));
  }

  const encryptedSecret = encryptMfaSecret(setup.secret);
  const now = new Date().toISOString();
  const result = await dbQuery<UserRow>(
    `
      UPDATE users
      SET mfa_secret = $2,
          mfa_enabled = TRUE,
          updated_at = $3
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        password_hash,
        role,
        allowed_screens,
        mfa_secret,
        mfa_enabled,
        profile_photo_mime,
        profile_photo_width,
        profile_photo_height,
        profile_photo_updated_at,
        disabled,
        session_version,
        created_at,
        updated_at
    `,
    [user.id, encryptedSecret, now],
  );

  const updated = result.rows[0];
  if (!updated) {
    clearMfaCookies();
    throw new Error("Usuario nao encontrado.");
  }

  deleteCookie(MFA_SETUP_COOKIE_NAME, { path: "/" });
  await appendAuditLog(auditClient(), {
    actorType: "panel",
    actorId: viewer.email,
    action: isUserMfaConfigured(user) ? "auth.mfa.reconfigured" : "auth.mfa.enabled",
    severity: "notice",
    message: `Conta ${viewer.email} ${isUserMfaConfigured(user) ? "reconfigurou" : "ativou"} MFA.`,
    createdAt: now,
    metadata: {
      alert: false,
      userId: user.id,
    },
  });

  return toViewer(updated);
}

export async function validateMfaLogin(input: MfaCodeInput) {
  const pending = readEncryptedCookie<MfaPendingPayload>(MFA_PENDING_COOKIE_NAME);
  const ipAddress = getRequestIP({ xForwardedFor: true }) ?? "";
  const userAgent = getRequestHeader("user-agent") ?? "";

  if (!pending) {
    clearMfaCookies();
    throw new Error("Sessao de MFA expirada. Entre novamente para continuar.");
  }

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const recentFailures = await countRecentFailedMfa(pending.userId, ipAddress, since);
  if (recentFailures >= 5) {
    throw new Error(
      "Muitas tentativas invalidas de MFA. Aguarde alguns minutos e tente novamente.",
    );
  }

  const user = await findUserById(pending.userId);
  if (!user || user.disabled) {
    clearMfaCookies();
    throw new Error("Sessao de MFA expirada. Entre novamente para continuar.");
  }

  if (Number(pending.sessionVersion) !== Number(user.session_version)) {
    clearMfaCookies();
    throw new Error("Sessao de MFA expirada. Entre novamente para continuar.");
  }

  if (!isUserMfaConfigured(user)) {
    clearMfaCookies();
    throw new Error("MFA nao esta ativo para esta conta.");
  }

  let resolvedSecret: ReturnType<typeof resolveStoredMfaSecret>;
  try {
    resolvedSecret = resolveStoredMfaSecret(user.mfa_secret ?? "");
  } catch (error) {
    await appendAuditLog(auditClient(), {
      actorType: "panel",
      actorId: user.email,
      action: "auth.mfa.state.invalid",
      severity: "critical",
      message: `MFA inconsistente para ${user.email}.`,
      metadata: {
        alert: true,
        userId: user.id,
        ipAddress,
        reason: error && typeof error === "object" && "code" in error ? error.code : "unknown",
      },
    });
    throw new Error("O MFA desta conta esta inconsistente e precisa ser reconfigurado.");
  }

  const assessment = assessTotpToken(resolvedSecret.secret, input.code);
  if (!assessment.valid) {
    await appendAuditLog(auditClient(), {
      actorType: "panel",
      actorId: user.email,
      action: "auth.mfa.failed",
      severity: "warn",
      message: `Falha de MFA para ${user.email}.`,
      metadata: {
        alert: false,
        userId: user.id,
        ipAddress,
        userAgent,
        reason: assessment.reason,
      },
    });
    throw new Error(buildMfaCodeErrorMessage(assessment.reason));
  }

  let authenticatedUser = user;
  if (resolvedSecret.needsMigration) {
    const encryptedSecret = encryptMfaSecret(resolvedSecret.secret);
    const migrationResult = await dbQuery<UserRow>(
      `
        UPDATE users
        SET mfa_secret = $2,
            mfa_enabled = TRUE,
            updated_at = $3
        WHERE id = $1
        RETURNING
          id,
          full_name,
          email,
          password_hash,
          role,
          allowed_screens,
          mfa_secret,
          mfa_enabled,
          profile_photo_mime,
          profile_photo_width,
          profile_photo_height,
          profile_photo_updated_at,
          disabled,
          session_version,
          created_at,
          updated_at
      `,
      [user.id, encryptedSecret, new Date().toISOString()],
    );
    authenticatedUser = migrationResult.rows[0] ?? {
      ...user,
      mfa_secret: encryptedSecret,
      mfa_enabled: true,
    };
  }

  clearMfaCookies();
  await createSessionForUser(authenticatedUser, {
    ipAddress: ipAddress || undefined,
    userAgent,
  });

  await appendAuditLog(auditClient(), {
    actorType: "panel",
    actorId: authenticatedUser.email,
    action: "auth.login.succeeded",
    severity: "notice",
    message: `Login com MFA concluido para ${authenticatedUser.email}.`,
    metadata: {
      alert: false,
      ipAddress,
      userAgent,
      userId: authenticatedUser.id,
      mfa: true,
      migratedMfaSecret: resolvedSecret.needsMigration,
    },
  });

  return toViewer(authenticatedUser);
}

export async function resetUserMfa(input: ResetUserMfaInput) {
  const actor = await requireAdminViewer();
  const target = await findUserById(input.userId);
  if (!target) {
    throw new Error("Usuario nao encontrado.");
  }

  if (target.id === actor.id) {
    throw new Error("Voce nao pode resetar o MFA da propria conta pela secao de Usuarios.");
  }

  const now = new Date().toISOString();
  const result = await withTransaction(async (client) => {
    const updated = await client.query<UserRow>(
      `
        UPDATE users
        SET mfa_secret = NULL,
            mfa_enabled = FALSE,
            session_version = session_version + 1,
            updated_at = $2
        WHERE id = $1
        RETURNING
          id,
          full_name,
          email,
          password_hash,
          role,
          allowed_screens,
          mfa_secret,
          mfa_enabled,
          profile_photo_mime,
          profile_photo_width,
          profile_photo_height,
          profile_photo_updated_at,
          disabled,
          session_version,
          created_at,
          updated_at
      `,
      [target.id, now],
    );

    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [target.id]);

    const user = updated.rows[0];
    if (!user) {
      throw new Error("Usuario nao encontrado.");
    }

    await appendAuditLog(client, {
      actorType: "panel",
      actorId: actor.email,
      action: "user.mfa.reset",
      severity: "warn",
      message: `Conta ${actor.email} resetou o MFA de ${target.email}.`,
      createdAt: now,
      metadata: {
        alert: true,
        targetUserId: target.id,
        targetEmail: target.email,
        previousMfaEnabled: isUserMfaConfigured(target),
      },
    });

    return user;
  });

  return toUserListItem(result);
}
