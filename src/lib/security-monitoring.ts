import { z } from "zod";

export const securityMonitoringFeatureId = "security_monitoring" as const;

export const securitySeverityValues = ["low", "medium", "high", "critical"] as const;
export type SecuritySeverity = (typeof securitySeverityValues)[number];

export const securityAlertStatusValues = [
  "open",
  "acknowledged",
  "investigating",
  "resolved",
  "false_positive",
] as const;
export type SecurityAlertStatus = (typeof securityAlertStatusValues)[number];

export const securityEventSchema = z.object({
  eventType: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  source: z.string().trim().min(1).max(120).default("agent"),
  severity: z.enum(securitySeverityValues).default("medium"),
  timestamp: z.string().datetime(),
  message: z.string().trim().min(1).max(2_000),
  attributes: z.record(z.unknown()).default({}),
  raw: z.string().max(8_000).default(""),
});

export const agentSecurityEventsIngestSchema = z.object({
  events: z.array(securityEventSchema).min(1).max(100),
});

export const securityAlertListInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  severity: z.enum(["all", ...securitySeverityValues]).default("all"),
  status: z.enum(["all", ...securityAlertStatusValues]).default("all"),
  machineId: z.string().trim().min(1).max(120).optional(),
  eventType: z.string().trim().min(1).max(120).optional(),
  ruleId: z.string().trim().min(1).max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const securityEventListInputSchema = securityAlertListInputSchema.omit({
  status: true,
  ruleId: true,
});

export const updateSecurityAlertStatusSchema = z.object({
  status: z.enum(securityAlertStatusValues),
});

export const createSecurityAlertCommentSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
});

export const securityRuleListInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  enabled: z.enum(["all", "true", "false"]).default("all"),
});

export const updateSecurityRuleSchema = z.object({
  enabled: z.boolean(),
});

export type AgentSecurityEventInput = z.infer<typeof securityEventSchema>;
export type AgentSecurityEventsIngestInput = z.infer<typeof agentSecurityEventsIngestSchema>;
export type SecurityAlertListInput = z.infer<typeof securityAlertListInputSchema>;
export type SecurityEventListInput = z.infer<typeof securityEventListInputSchema>;
export type SecurityRuleListInput = z.infer<typeof securityRuleListInputSchema>;
export type UpdateSecurityAlertStatusInput = z.infer<typeof updateSecurityAlertStatusSchema>;
export type CreateSecurityAlertCommentInput = z.infer<typeof createSecurityAlertCommentSchema>;
export type UpdateSecurityRuleInput = z.infer<typeof updateSecurityRuleSchema>;

export type SecurityPrincipal = {
  userId: string;
  role: "admin" | "member";
};

export type SecurityEventView = {
  id: string;
  machineId: string;
  agentId: string;
  eventType: string;
  source: string;
  severity: SecuritySeverity;
  timestamp: string;
  message: string;
  attributes: Record<string, unknown>;
  raw: string;
  createdAt: string;
};

export type SecurityAlertView = {
  id: string;
  ruleId: string;
  machineId: string;
  agentId: string | null;
  severity: SecuritySeverity;
  status: SecurityAlertStatus;
  title: string;
  description: string;
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  groupKey: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SecurityAlertDetailView = SecurityAlertView & {
  comments: SecurityAlertCommentView[];
  statusHistory: SecurityAlertStatusHistoryView[];
  events: SecurityEventView[];
};

export type SecurityAlertCommentView = {
  id: string;
  alertId: string;
  body: string;
  createdByUserId: string;
  createdBy: string;
  createdAt: string;
};

export type SecurityAlertStatusHistoryView = {
  id: string;
  alertId: string;
  previousStatus: SecurityAlertStatus | null;
  nextStatus: SecurityAlertStatus;
  changedByUserId: string | null;
  changedBy: string;
  changedAt: string;
};

export type SecurityRuleView = {
  id: string;
  name: string;
  description: string;
  eventType: string | null;
  ruleKind: string;
  severity: SecuritySeverity;
  enabled: boolean;
  groupBy: string[];
  condition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SecurityListResponse<T> = {
  items: T[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};
