import { ZodError, type z } from "zod";

export const BODY_LIMITS = {
  json: 256 * 1024,
  securityEvents: 512 * 1024,
  agentResult: 128 * 1024,
  profilePhoto: 6 * 1024 * 1024,
  terminalControl: 32 * 1024,
} as const;

export function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }

  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(statusCode) ? statusCode : null;
}

export function toHttpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

export function publicErrorMessage(error: unknown, fallback: string) {
  const statusCode = getErrorStatusCode(error);
  if (statusCode === 401 || statusCode === 403 || statusCode === 413 || statusCode === 429) {
    return error instanceof Error ? error.message : fallback;
  }

  if (error instanceof ZodError) {
    return "Payload invalido.";
  }

  return fallback;
}

export async function readRequestText(request: Request, limitBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > limitBytes) {
    throw toHttpError("Payload maior que o limite permitido.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > limitBytes) {
      throw toHttpError("Payload maior que o limite permitido.", 413);
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function readJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
  limitBytes = BODY_LIMITS.json,
): Promise<{ rawBody: string; data: z.output<TSchema> }> {
  const rawBody = await readRequestText(request, limitBytes);
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw toHttpError("JSON invalido.", 400);
  }

  return {
    rawBody,
    data: schema.parse(payload),
  };
}
