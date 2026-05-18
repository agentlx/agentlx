export function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, init);
}

export function jsonError(message: string, status = 400) {
  return jsonResponse(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}

export function textResponse(body: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }
  return new Response(body, {
    ...init,
    headers,
  });
}
