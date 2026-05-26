import { enterpriseFeatures, type EnterpriseFeature } from "@/lib/edition";
import type { EnterpriseProvider } from "./types";
import { communityResourceLimits } from "./community-resource-limits";

export const communityLicenseState = {
  edition: "community",
  tier: null,
  status: "community",
  licenseId: null,
  customerId: null,
  issuedAt: null,
  expiresAt: null,
  features: [] as EnterpriseFeature[],
  limits: {},
  message: "AgentLX Community inclui os recursos essenciais open source.",
  canInstallLicense: false,
} as const;

export function getEnterpriseProvider(): EnterpriseProvider {
  return {
    edition: "community",
    hasFeature: () => false,
    requireFeature(feature) {
      throw new Error(`Recurso ${feature} disponivel na edicao Enterprise.`);
    },
    getLicenseState: () => communityLicenseState,
    getEnterpriseMigrations: () => [],
    resourceLimits: communityResourceLimits,
  };
}

export { enterpriseFeatures };
