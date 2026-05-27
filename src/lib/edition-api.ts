import { createServerFn } from "@tanstack/react-start";

export const getEditionStatusAction = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAuthenticatedViewer } = await import("@/server/auth.server");
  await requireAuthenticatedViewer();
  const { getEditionStatus } = await import("@/server/edition.server");
  return getEditionStatus();
});
