import { createServerFn } from "@tanstack/react-start";
import {
  securityDashboardInputSchema,
  securityEventExportInputSchema,
  securityMachineEventsInputSchema,
} from "@/lib/security-monitoring";

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

export const getSecurityMachineEventsOverviewData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => securityMachineEventsInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    const { getEnterpriseSecurityMachineEventsOverview } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    return getEnterpriseSecurityMachineEventsOverview({
      ...data,
      principal: toSecurityPrincipal(viewer),
    });
  });

export const exportSecurityEventsData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => securityEventExportInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    const { exportEnterpriseSecurityEvents } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    return exportEnterpriseSecurityEvents({
      ...data,
      principal: toSecurityPrincipal(viewer),
    });
  });
