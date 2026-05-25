import type {
  RecurringScheduleLookupInput,
  RecurringScheduleView,
  RecurringTemplateScheduleInput,
} from "@/lib/agentlx";
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
  recurringJobs?: EnterpriseRecurringJobs;
};

export type { AgentLxEdition, EnterpriseFeature, EnterpriseLicenseState };
