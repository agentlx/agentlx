import { createServerFn } from "@tanstack/react-start";
import {
  createMachineGroupInputSchema,
  createMachineEnrollmentInputSchema,
  finalizeMachineEnrollmentInputSchema,
  executionLogPageInputSchema,
  createActionTemplateInputSchema,
  executeActionInputSchema,
  machinePageInputSchema,
  executionLookupSchema,
  machineGroupAssignmentInputSchema,
  machineControlActionInputSchema,
  machineLookupSchema,
  openRealtimeTerminalSessionInputSchema,
  recurringScheduleLookupSchema,
  recurringTemplateScheduleInputSchema,
  remoteTerminalInputSchema,
  startRealtimeTemplateExecutionInputSchema,
  templateLookupSchema,
  updateMachineGroupInputSchema,
  updateMachineAgentNameInputSchema,
  updateMachineScheduledTaskLimitInputSchema,
  updateActionTemplateInputSchema,
  machinePolicyMfaVerificationInputSchema,
  updateMachinePolicyInputSchema,
} from "@/lib/agentlx";

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireScreenAccess } = await import("@/server/auth.server");
  const viewer = await requireScreenAccess("dashboard");
  const { getDashboardView } = await import("@/server/panel.server");
  return getDashboardView(viewer.id);
});

export const getMachinesData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireScreenAccess } = await import("@/server/auth.server");
  const viewer = await requireScreenAccess("machines");
  const { getMachinesView } = await import("@/server/panel.server");
  return getMachinesView(viewer.id);
});

export const getMachinesPageAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => machinePageInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { getMachinesView } = await import("@/server/panel.server");
    return getMachinesView(viewer.id, data);
  });

export const createMachineEnrollmentCommandAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createMachineEnrollmentInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { previewMachineEnrollmentCommand } = await import("@/server/panel.server");
    return previewMachineEnrollmentCommand({ ...data, requestedBy: viewer.email });
  });

export const createPendingMachineEnrollmentAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => finalizeMachineEnrollmentInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { createMachineEnrollmentPending } = await import("@/server/panel.server");
    return createMachineEnrollmentPending({ ...data, requestedBy: viewer.email });
  });

export const getMachineDetailData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => machineLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { getMachineDetailView } = await import("@/server/panel.server");
    return getMachineDetailView(data.machineId, {
      userId: viewer.id,
      role: viewer.role,
      canAccessGroupsScreen: viewer.accessibleScreens.includes("groups"),
    });
  });

export const updateMachineAgentNameAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateMachineAgentNameInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { updateMachineAgentName } = await import("@/server/panel.server");
    return updateMachineAgentName({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const updateMachineScheduledTaskLimitAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateMachineScheduledTaskLimitInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { updateMachineScheduledTaskLimit } = await import("@/server/panel.server");
    return updateMachineScheduledTaskLimit({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const getRealtimeTerminalPresenceAction = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => machineLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { assertViewerCanAccessMachine } = await import("@/server/panel.server");
    await assertViewerCanAccessMachine(data.machineId, viewer.id);
    const { getRealtimeTerminalPresence } = await import("@/server/terminal-realtime.server");
    return getRealtimeTerminalPresence(data.machineId);
  });

export const getMachineGroupsData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireScreenAccess } = await import("@/server/auth.server");
  await requireScreenAccess("groups");
  const { getMachineGroupsPageView } = await import("@/server/panel.server");
  return getMachineGroupsPageView();
});

export const getMachinePoliciesData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireScreenAccess } = await import("@/server/auth.server");
  await requireScreenAccess("policies");
  const { listEnterpriseMachinePolicies } = await import("@/server/edition.server");
  return listEnterpriseMachinePolicies();
});

export const updateMachinePolicyAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateMachinePolicyInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("policies");
    const { updateEnterpriseMachinePolicy } = await import("@/server/edition.server");
    return updateEnterpriseMachinePolicy({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const getTemplateCatalogData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireScreenAccess } = await import("@/server/auth.server");
  const viewer = await requireScreenAccess("templates");
  const { getTemplateCatalogView } = await import("@/server/panel.server");
  return getTemplateCatalogView(viewer.id);
});

export const getExecutionLogsData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireScreenAccess } = await import("@/server/auth.server");
  const viewer = await requireScreenAccess("logs");
  const { getExecutionLogFeed } = await import("@/server/panel.server");
  return getExecutionLogFeed(viewer.id);
});

export const getExecutionLogsPageAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => executionLogPageInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("logs");
    const { getExecutionLogFeed } = await import("@/server/panel.server");
    return getExecutionLogFeed(viewer.id, data);
  });

export const getExecutionDetailData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => executionLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAnyScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireAnyScreenAccess(["machines", "templates", "logs"]);
    const { getExecutionDetailView } = await import("@/server/panel.server");
    return getExecutionDetailView(viewer.id, data.executionId);
  });

export const queueTemplateExecutionAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => executeActionInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAnyScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireAnyScreenAccess(["machines", "templates"]);
    const { queueTemplateExecution } = await import("@/server/panel.server");
    return queueTemplateExecution({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const createRecurringTemplateScheduleAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => recurringTemplateScheduleInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAnyScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireAnyScreenAccess(["machines", "templates"]);
    const { createRecurringTemplateSchedule } = await import("@/server/panel.server");
    return createRecurringTemplateSchedule({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const cancelRecurringTemplateScheduleAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => recurringScheduleLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAnyScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireAnyScreenAccess(["machines", "templates", "logs"]);
    const { cancelRecurringTemplateSchedule } = await import("@/server/panel.server");
    return cancelRecurringTemplateSchedule({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const createMachineGroupAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createMachineGroupInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("groups");
    const { createMachineGroup } = await import("@/server/panel.server");
    return createMachineGroup({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const updateMachineGroupAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateMachineGroupInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("groups");
    const { updateMachineGroup } = await import("@/server/panel.server");
    return updateMachineGroup({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const assignMachineGroupsAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => machineGroupAssignmentInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { assignMachineGroups } = await import("@/server/panel.server");
    return assignMachineGroups({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
      requestedByRole: viewer.role,
      canAccessGroupsScreen: viewer.accessibleScreens.includes("groups"),
    });
  });

export const createTemplateAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createActionTemplateInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("templates");
    const { createActionTemplate } = await import("@/server/panel.server");
    return createActionTemplate({ ...data, requestedBy: viewer.email });
  });

export const updateTemplateAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateActionTemplateInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("templates");
    const { updateActionTemplate } = await import("@/server/panel.server");
    return updateActionTemplate({ ...data, requestedBy: viewer.email });
  });

export const deleteTemplateAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => templateLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("templates");
    const { deleteActionTemplate } = await import("@/server/panel.server");
    return deleteActionTemplate({ ...data, requestedBy: viewer.email });
  });

export const startRealtimeTemplateExecutionAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => startRealtimeTemplateExecutionInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireAnyScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireAnyScreenAccess(["machines", "templates"]);
    const { startRealtimeTemplateExecution } = await import("@/server/panel.server");
    return startRealtimeTemplateExecution({
      ...data,
      requestedBy: viewer.email,
      openedByUserId: viewer.id,
      requestedByUserId: viewer.id,
    });
  });

export const runRemoteTerminalAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => remoteTerminalInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { queueRemoteTerminalCommand } = await import("@/server/panel.server");
    return queueRemoteTerminalCommand({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const queueMachineControlAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => machineControlActionInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { queueMachineControlAction } = await import("@/server/panel.server");
    return queueMachineControlAction({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const queueMachineSyncAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => machineLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { queueMachineSync } = await import("@/server/panel.server");
    return queueMachineSync({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const queueMachineAgentUninstallAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => machineLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { queueMachineAgentUninstall } = await import("@/server/panel.server");
    return queueMachineAgentUninstall({
      ...data,
      requestedBy: viewer.email,
      requestedByUserId: viewer.id,
    });
  });

export const openRealtimeTerminalSessionAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => openRealtimeTerminalSessionInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { assertViewerCanAccessMachine } = await import("@/server/panel.server");
    await assertViewerCanAccessMachine(data.machineId, viewer.id);
    const { openRealtimeTerminalSession } = await import("@/server/terminal-realtime.server");
    return openRealtimeTerminalSession(data, {
      userId: viewer.id,
      actorId: viewer.email,
    });
  });

export const verifyMachinePolicyMfaAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => machinePolicyMfaVerificationInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireScreenAccess } = await import("@/server/auth.server");
    const viewer = await requireScreenAccess("machines");
    const { assertViewerCanAccessMachine } = await import("@/server/panel.server");
    await assertViewerCanAccessMachine(data.machineId, viewer.id);
    const { verifyEnterpriseMachinePolicyMfa } = await import("@/server/edition.server");
    return verifyEnterpriseMachinePolicyMfa({
      ...data,
      userId: viewer.id,
      requestedBy: viewer.email,
    });
  });
