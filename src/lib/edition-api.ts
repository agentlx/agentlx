import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const licenseInputSchema = z.object({
  license: z.string().min(1).max(80_000),
});

export const getEditionStatusAction = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAuthenticatedViewer } = await import("@/server/auth.server");
  await requireAuthenticatedViewer();
  const { getEditionStatus } = await import("@/server/edition.server");
  return getEditionStatus();
});

export const installEnterpriseLicenseAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => licenseInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAuthenticatedViewer } = await import("@/server/auth.server");
    const viewer = await requireAuthenticatedViewer();
    if (viewer.role !== "admin") {
      throw new Error("Apenas administradores podem trocar a licenca.");
    }

    const { installEnterpriseLicense } = await import("@/server/edition.server");
    return installEnterpriseLicense(data.license);
  });
