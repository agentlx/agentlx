import { enterpriseFeatures, type EnterpriseFeature } from "@/lib/edition";
import type { EnterpriseProvider } from "./types";

export const communityLicenseState = {
  edition: "community",
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
  };
}

export { enterpriseFeatures };
