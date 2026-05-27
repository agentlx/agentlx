import { createServerFn } from "@tanstack/react-start";
import { securityDashboardInputSchema } from "@/lib/security-monitoring";

export const getSecurityDashboardData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => securityDashboardInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    const { getEnterpriseSecurityDashboard } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    return getEnterpriseSecurityDashboard({
      ...data,
      principal: toSecurityPrincipal(viewer),
    });
  });
