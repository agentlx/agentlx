import {
  enterpriseFeatureLabels,
  enterpriseFeatures,
  type EditionStatusView,
  type EnterpriseFeature,
  type EnterpriseResourceLimitState,
  type EnterpriseTerminalSessionLimitState,
  type ManagedResourceKind,
} from "@/lib/edition";
import type {
  RecurringScheduleLookupInput,
  RecurringScheduleView,
  RecurringTemplateScheduleInput,
} from "@/lib/agentlx";
import type { EnterpriseDbClient, EnterpriseRuntimeContext } from "@/enterprise/types";
import { appendAuditLog } from "./audit.server";
import { dbQuery, withTransaction } from "./db.server";

async function loadProvider() {
  const enterprise = await import("@agentlx/enterprise");
  return enterprise.getEnterpriseProvider();
}

export async function hasEnterpriseFeature(feature: EnterpriseFeature) {
  const provider = await loadProvider();
  if (provider.syncLicenseState) {
    const state = await provider.syncLicenseState(enterpriseRuntimeContext());
    return state.status === "valid" && state.features.includes(feature);
  }
  return Boolean(await provider.hasFeature(feature));
}

export async function requireEnterpriseFeature(feature: EnterpriseFeature) {
  const provider = await loadProvider();
  if (provider.syncLicenseState) {
    const state = await provider.syncLicenseState(enterpriseRuntimeContext());
    if (state.status !== "valid") {
      throw new Error(state.message);
    }
    if (!state.features.includes(feature)) {
      throw new Error(`Recurso ${feature} nao esta habilitado nesta licenca Enterprise.`);
    }
    return;
  }
  await provider.requireFeature(feature);
}

export async function getEditionStatus(): Promise<EditionStatusView> {
  const provider = await loadProvider();
  const context = enterpriseRuntimeContext();
  const licenseState = provider.syncLicenseState
    ? await provider.syncLicenseState(context)
    : await provider.getLicenseState();

  return {
    ...licenseState,
    featureCatalog: enterpriseFeatures.map((feature) => ({
      id: feature,
      label: enterpriseFeatureLabels[feature],
      enabled: licenseState.features.includes(feature),
    })),
  };
}

export async function installEnterpriseLicense(license: string): Promise<EditionStatusView> {
  const provider = await loadProvider();
  if (!provider.installLicense) {
    throw new Error("A ativacao de licenca esta disponivel apenas na edicao Enterprise.");
  }

  await provider.installLicense(license, enterpriseRuntimeContext());
  return getEditionStatus();
}

export async function listEnterpriseRecurringSchedules(input: {
  viewerUserId: string;
  limit?: number;
}): Promise<RecurringScheduleView[]> {
  const provider = await loadProvider();
  if (!provider.recurringJobs || !(await hasEnterpriseFeature("recurring_jobs"))) {
    return [];
  }

  return provider.recurringJobs.listSchedules(input, enterpriseRuntimeContext());
}

export async function createEnterpriseRecurringTemplateSchedule(
  input: RecurringTemplateScheduleInput & {
    requestedBy: string;
    requestedByUserId: string;
  },
): Promise<RecurringScheduleView> {
  const provider = await loadProvider();
  await requireEnterpriseFeature("recurring_jobs");
  if (!provider.recurringJobs) {
    throw new Error("Execucoes recorrentes estao disponiveis apenas na edicao Enterprise.");
  }

  return provider.recurringJobs.createSchedule(input, enterpriseRuntimeContext());
}

export async function cancelEnterpriseRecurringTemplateSchedule(
  input: RecurringScheduleLookupInput & {
    requestedBy: string;
    requestedByUserId: string;
  },
): Promise<{ scheduleId: string; cancelledExecutions: number }> {
  const provider = await loadProvider();
  await requireEnterpriseFeature("recurring_jobs");
  if (!provider.recurringJobs) {
    throw new Error("Execucoes recorrentes estao disponiveis apenas na edicao Enterprise.");
  }

  return provider.recurringJobs.cancelSchedule(input, enterpriseRuntimeContext());
}

export async function materializeEnterpriseRecurringExecutions(
  input: {
    machineId: string;
    agentId: string;
    now: string;
    limit: number;
  },
  client: EnterpriseDbClient,
) {
  const provider = await loadProvider();
  if (!provider.recurringJobs || !(await hasEnterpriseFeature("recurring_jobs"))) {
    return;
  }

  await provider.recurringJobs.materializeDueExecutions(input, enterpriseRuntimeContext(client));
}

export async function getEnterpriseResourceLimit(
  input: {
    resource: ManagedResourceKind;
    includePendingEnrollments?: boolean;
  },
  client?: EnterpriseDbClient,
): Promise<EnterpriseResourceLimitState> {
  const provider = await loadProvider();
  if (!provider.resourceLimits) {
    throw new Error("Limites de recursos nao estao configurados nesta edicao.");
  }

  return provider.resourceLimits.getLimit(input, enterpriseRuntimeContext(client));
}

export async function assertEnterpriseResourceCanCreate(
  input: {
    resource: ManagedResourceKind;
    increment?: number;
    includePendingEnrollments?: boolean;
  },
  client?: EnterpriseDbClient,
): Promise<EnterpriseResourceLimitState> {
  const provider = await loadProvider();
  if (!provider.resourceLimits) {
    throw new Error("Limites de recursos nao estao configurados nesta edicao.");
  }

  return provider.resourceLimits.assertCanCreate(input, enterpriseRuntimeContext(client));
}

export async function assertEnterpriseTerminalSessionCanOpen(
  input: {
    userId: string;
    increment?: number;
  },
  client?: EnterpriseDbClient,
): Promise<EnterpriseTerminalSessionLimitState> {
  const provider = await loadProvider();
  if (!provider.terminalSessions) {
    throw new Error("Limites de terminal nao estao configurados nesta edicao.");
  }

  return provider.terminalSessions.assertCanOpen(input, enterpriseRuntimeContext(client));
}

function enterpriseRuntimeContext(client?: EnterpriseDbClient): EnterpriseRuntimeContext {
  return {
    query: client?.query ?? dbQuery,
    withTransaction: <T>(fn: (client: EnterpriseDbClient) => Promise<T>) =>
      withTransaction((transactionClient) =>
        fn({ query: (text, params) => transactionClient.query(text, params) }),
      ),
    audit: async (input: {
      actorId: string;
      action: string;
      message: string;
      severity?: "info" | "notice" | "warn" | "critical";
      metadata?: Record<string, unknown>;
    }) => {
      await appendAuditLog(
        { query: dbQuery },
        {
          actorType: "system",
          actorId: input.actorId,
          action: input.action,
          message: input.message,
          severity: input.severity ?? "notice",
          metadata: input.metadata,
        },
      );
    },
  };
}
