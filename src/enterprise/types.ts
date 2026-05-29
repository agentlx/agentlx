import type {
  RecurringScheduleLookupInput,
  RecurringScheduleView,
  RecurringTemplateScheduleInput,
  MachinePoliciesPageView,
  MachinePolicyAction,
  MachinePolicyMfaRequirementView,
  MachinePolicyMfaVerificationInput,
  UpdateMachinePolicyInput,
} from "@/lib/agentlx";
import type {
  AgentSecurityEventsIngestInput,
  CreateSecurityAlertCommentInput,
  SecurityAlertDetailView,
  SecurityAlertCommentView,
  SecurityAlertListInput,
  SecurityAlertView,
  SecurityDashboardInput,
  SecurityDashboardView,
  SecurityEventDetailView,
  SecurityEventExportInput,
  SecurityEventExportView,
  SecurityEventListInput,
  SecurityEventView,
  SecurityListResponse,
  SecurityMachineEventsInput,
  SecurityMachineEventsOverviewView,
  SecurityPrincipal,
  SecurityRuleListInput,
  SecurityRuleView,
  UpdateSecurityAlertStatusInput,
  UpdateSecurityRuleInput,
} from "@/lib/security-monitoring";
import type {
  AgentLxEdition,
  EnterpriseFeature,
  EnterpriseLicenseState,
  EnterpriseResourceLimitState,
  EnterpriseTerminalSessionLimitState,
  ManagedResourceKind,
} from "@/lib/edition";

export type EnterpriseMigration = {
  id: string;
  sql: string;
};

export type EnterpriseRuntimeContext = {
  query: <T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  withTransaction?: <T>(fn: (client: EnterpriseDbClient) => Promise<T>) => Promise<T>;
  audit?: (input: {
    actorId: string;
    action: string;
    message: string;
    severity?: "info" | "notice" | "warn" | "critical";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

export type EnterpriseDbClient = {
  query: EnterpriseRuntimeContext["query"];
};

export type EnterpriseRecurringJobs = {
  listSchedules(
    input: {
      viewerUserId: string;
      limit?: number;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<RecurringScheduleView[]>;
  createSchedule(
    input: RecurringTemplateScheduleInput & {
      requestedBy: string;
      requestedByUserId: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<RecurringScheduleView>;
  cancelSchedule(
    input: RecurringScheduleLookupInput & {
      requestedBy: string;
      requestedByUserId: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<{ scheduleId: string; cancelledExecutions: number }>;
  materializeDueExecutions(
    input: {
      machineId: string;
      agentId: string;
      now: string;
      limit: number;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<void>;
};

export type EnterpriseResourceLimits = {
  getLimit(
    input: {
      resource: ManagedResourceKind;
      includePendingEnrollments?: boolean;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<EnterpriseResourceLimitState>;
  assertCanCreate(
    input: {
      resource: ManagedResourceKind;
      increment?: number;
      includePendingEnrollments?: boolean;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<EnterpriseResourceLimitState>;
};

export type EnterpriseTerminalSessions = {
  getLimit(
    input: {
      userId: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<EnterpriseTerminalSessionLimitState>;
  assertCanOpen(
    input: {
      userId: string;
      increment?: number;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<EnterpriseTerminalSessionLimitState>;
};

export type EnterpriseMachinePolicies = {
  listPolicies(context: EnterpriseRuntimeContext): Promise<MachinePoliciesPageView>;
  updatePolicy(
    input: UpdateMachinePolicyInput & {
      requestedBy: string;
      requestedByUserId: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<MachinePoliciesPageView>;
  getMfaRequirement(
    input: {
      machineId: string;
      userId: string;
      purpose: "machine_access" | "terminal";
    },
    context: EnterpriseRuntimeContext,
  ): Promise<MachinePolicyMfaRequirementView | null>;
  recordMfaGrant(
    input: MachinePolicyMfaVerificationInput & {
      userId: string;
      requestedBy: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<MachinePolicyMfaRequirementView>;
  assertAllowed(
    input: {
      machineId: string;
      userId: string;
      action: MachinePolicyAction;
      templateRisk?: "low" | "medium" | "high";
      machineControlAction?: "restart" | "poweroff";
    },
    context: EnterpriseRuntimeContext,
  ): Promise<void>;
};

export type EnterpriseAgentRuntimeExtensionFile = {
  path: string;
  body: string;
  contentType?: string;
};

export type EnterpriseAgentRuntimeExtensions = {
  listFiles():
    | Promise<EnterpriseAgentRuntimeExtensionFile[]>
    | EnterpriseAgentRuntimeExtensionFile[];
};

export type EnterpriseSecurityMonitoring = {
  ingestAgentEvents(
    input: {
      agentId: string;
      machineId: string;
      payload: AgentSecurityEventsIngestInput;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<{ ok: true; accepted: number; duplicateCount: number; alertCount: number }>;
  getDashboard(
    input: SecurityDashboardInput & { principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityDashboardView>;
  listAlerts(
    input: SecurityAlertListInput & { principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityListResponse<SecurityAlertView>>;
  getAlert(
    input: { alertId: string; principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityAlertDetailView>;
  updateAlertStatus(
    input: UpdateSecurityAlertStatusInput & {
      alertId: string;
      principal: SecurityPrincipal;
      changedBy: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityAlertView>;
  createAlertComment(
    input: CreateSecurityAlertCommentInput & {
      alertId: string;
      principal: SecurityPrincipal;
      createdBy: string;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityAlertCommentView>;
  listEvents(
    input: SecurityEventListInput & { principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityListResponse<SecurityEventView>>;
  getMachineEventsOverview(
    input: SecurityMachineEventsInput & { principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityMachineEventsOverviewView>;
  getEventDetail(
    input: { eventId: string; principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityEventDetailView>;
  exportEvents(
    input: SecurityEventExportInput & { principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityEventExportView>;
  listRules(
    input: SecurityRuleListInput & { principal: SecurityPrincipal },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityListResponse<SecurityRuleView>>;
  updateRule(
    input: UpdateSecurityRuleInput & {
      ruleId: string;
      principal: SecurityPrincipal;
    },
    context: EnterpriseRuntimeContext,
  ): Promise<SecurityRuleView>;
  runPeriodicJobs?(context: EnterpriseRuntimeContext): Promise<void>;
  startBackgroundJobs?(context: EnterpriseRuntimeContext): void;
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
  resourceLimits?: EnterpriseResourceLimits;
  recurringJobs?: EnterpriseRecurringJobs;
  terminalSessions?: EnterpriseTerminalSessions;
  machinePolicies?: EnterpriseMachinePolicies;
  securityMonitoring?: EnterpriseSecurityMonitoring;
  agentRuntimeExtensions?: EnterpriseAgentRuntimeExtensions;
};

export type { AgentLxEdition, EnterpriseFeature, EnterpriseLicenseState };
