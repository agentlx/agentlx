import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createSecurityAlertCommentSchema,
  securityDashboardInputSchema,
  securityEventDetailInputSchema,
  securityEventExportInputSchema,
  securityMachineEventsInputSchema,
  securityRuleListInputSchema,
  updateSecurityAlertStatusSchema,
  updateSecurityRuleSchema,
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

export const listSecurityRulesData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => securityRuleListInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    if (viewer.role !== "admin") {
      throw Object.assign(new Error("Esta operacao e restrita a administradores."), {
        statusCode: 403,
      });
    }
    const { listEnterpriseSecurityRules } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    const rules = await listEnterpriseSecurityRules({
      ...data,
      principal: toSecurityPrincipal(viewer),
    });
    return JSON.parse(JSON.stringify(rules));
  });

export const updateSecurityRuleData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    updateSecurityRuleSchema
      .extend({
        ruleId: z.string().trim().min(1).max(120),
      })
      .parse(typeof data === "object" && data !== null ? data : {}),
  )
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    if (viewer.role !== "admin") {
      throw Object.assign(new Error("Esta operacao e restrita a administradores."), {
        statusCode: 403,
      });
    }
    const { updateEnterpriseSecurityRule } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    const rule = await updateEnterpriseSecurityRule({
      ...data,
      principal: toSecurityPrincipal(viewer),
    });
    return JSON.parse(JSON.stringify(rule));
  });

export const updateSecurityAlertStatusData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const base = typeof data === "object" && data !== null ? data : {};
    return updateSecurityAlertStatusSchema
      .extend({
        alertId: securityEventDetailInputSchema.shape.eventId,
      })
      .parse(base);
  })
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    const { updateEnterpriseSecurityAlertStatus } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    const alert = await updateEnterpriseSecurityAlertStatus({
      ...data,
      principal: toSecurityPrincipal(viewer),
      changedBy: viewer.email,
    });
    return JSON.parse(JSON.stringify(alert));
  });

export const createSecurityAlertCommentData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const base = typeof data === "object" && data !== null ? data : {};
    return createSecurityAlertCommentSchema
      .extend({
        alertId: securityEventDetailInputSchema.shape.eventId,
      })
      .parse(base);
  })
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("monitoring");
    const { createEnterpriseSecurityAlertComment } = await import("@/server/edition.server");
    const { toSecurityPrincipal } = await import("@/server/security-monitoring.server");

    const comment = await createEnterpriseSecurityAlertComment({
      ...data,
      principal: toSecurityPrincipal(viewer),
      createdBy: viewer.email,
    });
    return JSON.parse(JSON.stringify(comment));
  });
