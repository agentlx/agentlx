import type { AgentLxEdition, EnterpriseFeature, EnterpriseLicenseState } from "@/lib/edition";

export type EnterpriseMigration = {
  id: string;
  sql: string;
};

export type EnterpriseRuntimeContext = {
  query: <T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  audit?: (input: {
    actorId: string;
    action: string;
    message: string;
    severity?: "info" | "notice" | "warn" | "critical";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

export type EnterpriseProvider = {
  edition: AgentLxEdition;
  hasFeature(feature: EnterpriseFeature): boolean | Promise<boolean>;
  requireFeature(feature: EnterpriseFeature): void | Promise<void>;
  getLicenseState(): EnterpriseLicenseState | Promise<EnterpriseLicenseState>;
  syncLicenseState?(context: EnterpriseRuntimeContext): Promise<EnterpriseLicenseState>;
  installLicense?(
    license: string,
    context: EnterpriseRuntimeContext,
  ): Promise<EnterpriseLicenseState>;
  getEnterpriseMigrations?(): EnterpriseMigration[];
};

export type { AgentLxEdition, EnterpriseFeature, EnterpriseLicenseState };
