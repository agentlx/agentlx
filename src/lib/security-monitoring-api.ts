import { createServerFn } from "@tanstack/react-start";
import {
  securityDashboardInputSchema,
  securityEventDetailInputSchema,
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

export const getSecurityEventDetailData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => securityEventDetailInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    const { getEnterpriseSecurityEventDetail } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    const detail = await getEnterpriseSecurityEventDetail({
      ...data,
      principal: toSecurityPrincipal(viewer),
    });

    return JSON.parse(JSON.stringify(detail));
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
