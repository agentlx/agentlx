import {
  enterpriseFeatureLabels,
  enterpriseFeatures,
  type EditionStatusView,
  type EnterpriseFeature,
} from "@/lib/edition";
import { appendAuditLog } from "./audit.server";
import { dbQuery } from "./db.server";

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
      throw new Error(
        `Recurso ${feature} nao esta habilitado nesta licenca Enterprise.`,
      );
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

function enterpriseRuntimeContext() {
  return {
    query: dbQuery,
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
