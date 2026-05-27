export const enterpriseFeatures = [
  "security_monitoring",
  "advanced_audit",
  "recurring_jobs",
  "terminal_collaboration",
  "sso",
  "advanced_rbac",
  "machine_policy",
  "report_export",
  "high_scale_limits",
] as const;

export type EnterpriseFeature = (typeof enterpriseFeatures)[number];
export type AgentLxEdition = "community" | "enterprise";
export const managedResourceKinds = ["machines", "templates", "groups"] as const;
export type ManagedResourceKind = (typeof managedResourceKinds)[number];

export const enterpriseFeatureLabels: Record<EnterpriseFeature, string> = {
  security_monitoring: "Monitoramento de seguranca",
  advanced_audit: "Auditoria avancada",
  recurring_jobs: "Execucoes recorrentes",
  terminal_collaboration: "Colaboracao em terminal",
  sso: "SSO/SAML/OIDC",
  advanced_rbac: "RBAC avancado",
  machine_policy: "Politicas de maquinas",
  report_export: "Exportacao de relatorios",
  high_scale_limits: "Limites de alta escala",
};

export type EnterpriseLicenseStatus = "community" | "missing" | "valid" | "expired" | "invalid";
export type EnterpriseLicenseTier = "starter" | "pro" | "enterprise";
export type EnterpriseLimitValue = string | number | boolean | null;

export type EnterpriseLicenseState = {
  edition: AgentLxEdition;
  tier: EnterpriseLicenseTier | null;
  status: EnterpriseLicenseStatus;
  licenseId: string | null;
  customerId: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  features: EnterpriseFeature[];
  limits: Record<string, EnterpriseLimitValue>;
  message: string;
  canInstallLicense: boolean;
};

export type EnterpriseResourceLimitState = {
  resource: ManagedResourceKind;
  used: number;
  limit: number | null;
  remaining: number | null;
  allowed: boolean;
  message: string;
};

export type EnterpriseTerminalSessionLimitState = {
  userId: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  allowed: boolean;
  message: string;
};

export type EditionStatusView = EnterpriseLicenseState & {
  featureCatalog: Array<{
    id: EnterpriseFeature;
    label: string;
    enabled: boolean;
  }>;
};
