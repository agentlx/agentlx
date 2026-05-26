import { z } from "zod";

export const userRoleValues = ["admin", "member"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const screenPermissionValues = [
  "dashboard",
  "machines",
  "groups",
  "templates",
  "policies",
  "logs",
  "users",
] as const;
export type ScreenPermission = (typeof screenPermissionValues)[number];

export const screenPermissionLabels: Record<ScreenPermission, string> = {
  dashboard: "Dashboard",
  machines: "Maquinas",
  groups: "Grupos",
  templates: "Templates",
  policies: "Politicas",
  logs: "Logs",
  users: "Usuarios",
};

export const profilePhotoAllowedMimeTypes = ["image/png", "image/jpeg"] as const;
export const profilePhotoInputMaxBytes = 5 * 1024 * 1024;
export const profilePhotoMaxBytes = 2 * 1024 * 1024;
export const profilePhotoSizePx = 512;
export const profilePhotoInputMaxSizeLabel = "5 MiB";
export const profilePhotoMaxSizeLabel = "2 MiB";
const profilePhotoMaxDataUrlLength = Math.ceil((profilePhotoMaxBytes * 4) / 3) + 64;

export const loginInputSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

export const createUserInputSchema = z.object({
  fullName: z.string().min(3).max(160),
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
  role: z.enum(userRoleValues),
  allowedScreens: z.array(z.enum(screenPermissionValues)).default([]),
});

export const updateUserInputSchema = z.object({
  userId: z.string().min(1).max(120),
  fullName: z.string().min(3).max(160),
  email: z.string().email().max(160),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(userRoleValues),
  allowedScreens: z.array(z.enum(screenPermissionValues)).default([]),
  disabled: z.boolean().default(false),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const updateProfilePhotoInputSchema = z.object({
  imageDataUrl: z.string().min(1).max(profilePhotoMaxDataUrlLength),
});

export const mfaCodeInputSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Codigo MFA invalido."),
});

export const resetUserMfaInputSchema = z.object({
  userId: z.string().min(1).max(120),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
export type UpdateProfilePhotoInput = z.infer<typeof updateProfilePhotoInputSchema>;
export type MfaCodeInput = z.infer<typeof mfaCodeInputSchema>;
export type ResetUserMfaInput = z.infer<typeof resetUserMfaInputSchema>;

export type MfaSetupView = {
  qrCodeDataUrl: string;
  manualEntryKey: string;
  issuer: string;
  accountName: string;
};

export type LoginMfaChallenge = {
  mfaRequired: true;
  pendingMfa: {
    email: string;
    fullName: string;
  };
};

export type LoginResult = AuthViewer | LoginMfaChallenge;

export type AuthViewer = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  allowedScreens: ScreenPermission[];
  accessibleScreens: ScreenPermission[];
  mfaEnabled: boolean;
  disabled: boolean;
  profilePhotoUrl: string | null;
  profilePhotoUpdatedAt: string | null;
};

export type UserListItem = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  allowedScreens: ScreenPermission[];
  accessibleScreens: ScreenPermission[];
  mfaEnabled: boolean;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export function getAllScreenPermissions(): ScreenPermission[] {
  return [...screenPermissionValues];
}

export function normalizeAllowedScreens(
  role: UserRole,
  screens: ScreenPermission[],
): ScreenPermission[] {
  if (role === "admin") {
    return getAllScreenPermissions();
  }

  return Array.from(new Set(screens)).filter((screen) => screen !== "users");
}

export function getAccessibleScreensForRole(
  role: UserRole,
  allowedScreens: ScreenPermission[],
): ScreenPermission[] {
  return normalizeAllowedScreens(role, allowedScreens);
}

export function canAccessScreen(
  viewer: Pick<AuthViewer, "accessibleScreens"> | null | undefined,
  screen: ScreenPermission,
) {
  if (!viewer) {
    return false;
  }

  return viewer.accessibleScreens.includes(screen);
}

export function screenPath(screen: ScreenPermission) {
  switch (screen) {
    case "dashboard":
      return "/";
    case "machines":
      return "/machines";
    case "groups":
      return "/groups";
    case "templates":
      return "/templates";
    case "policies":
      return "/policies";
    case "logs":
      return "/logs";
    case "users":
      return "/users";
    default:
      return screen satisfies never;
  }
}

export function resolveDefaultAuthenticatedPath(
  viewer: Pick<AuthViewer, "accessibleScreens"> | null | undefined,
) {
  if (!viewer) {
    return "/login";
  }

  const preferenceOrder: ScreenPermission[] = [
    "dashboard",
    "machines",
    "groups",
    "templates",
    "policies",
    "logs",
    "users",
  ];

  for (const screen of preferenceOrder) {
    if (viewer.accessibleScreens.includes(screen)) {
      return screenPath(screen);
    }
  }

  return "/profile";
}

export function initialsFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "US";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}
