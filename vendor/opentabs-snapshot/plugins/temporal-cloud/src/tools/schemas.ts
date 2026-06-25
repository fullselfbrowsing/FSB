import { z } from 'zod';

// --- Shared Parameters ---

export const namespaceParam = z
  .string()
  .optional()
  .describe(
    'Temporal namespace (e.g., "prod-us-west-2.abc123"). Defaults to the namespace in the current browser tab.',
  );

// --- Workflow Execution ---

export const workflowExecutionSchema = z.object({
  workflow_id: z.string().describe('Workflow ID'),
  run_id: z.string().describe('Run ID for this execution'),
  type: z.string().describe('Workflow type name'),
  status: z.string().describe('Execution status (e.g., WORKFLOW_EXECUTION_STATUS_RUNNING)'),
  task_queue: z.string().describe('Task queue name'),
  start_time: z.string().describe('ISO 8601 start timestamp'),
  execution_time: z.string().describe('ISO 8601 execution timestamp'),
  close_time: z.string().describe('ISO 8601 close timestamp (empty if running)'),
  history_length: z.string().describe('Number of events in history'),
  memo: z.record(z.string(), z.string()).describe('Memo fields (key-value pairs)'),
  parent_workflow_id: z.string().describe('Parent workflow ID (empty if none)'),
  parent_run_id: z.string().describe('Parent run ID (empty if none)'),
  root_workflow_id: z.string().describe('Root workflow ID'),
  root_run_id: z.string().describe('Root run ID'),
});

export interface RawWorkflowExecution {
  execution?: { workflowId?: string; runId?: string };
  type?: { name?: string };
  status?: string;
  taskQueue?: string;
  startTime?: string;
  executionTime?: string;
  closeTime?: string;
  historyLength?: string;
  memo?: { fields?: Record<string, { data?: string }> };
  parentExecution?: { workflowId?: string; runId?: string };
  rootExecution?: { workflowId?: string; runId?: string };
  searchAttributes?: { indexedFields?: Record<string, unknown> };
}

const decodeMemo = (memo?: { fields?: Record<string, { data?: string }> }): Record<string, string> => {
  if (!memo?.fields) return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(memo.fields)) {
    if (val?.data) {
      try {
        result[key] = atob(val.data);
      } catch {
        result[key] = val.data;
      }
    }
  }
  return result;
};

export const mapWorkflowExecution = (w: RawWorkflowExecution) => ({
  workflow_id: w.execution?.workflowId ?? '',
  run_id: w.execution?.runId ?? '',
  type: w.type?.name ?? '',
  status: w.status ?? '',
  task_queue: w.taskQueue ?? '',
  start_time: w.startTime ?? '',
  execution_time: w.executionTime ?? '',
  close_time: w.closeTime ?? '',
  history_length: w.historyLength ?? '0',
  memo: decodeMemo(w.memo),
  parent_workflow_id: w.parentExecution?.workflowId ?? '',
  parent_run_id: w.parentExecution?.runId ?? '',
  root_workflow_id: w.rootExecution?.workflowId ?? '',
  root_run_id: w.rootExecution?.runId ?? '',
});

// --- Workflow Detail ---

export const workflowDetailSchema = z.object({
  workflow_id: z.string().describe('Workflow ID'),
  run_id: z.string().describe('Run ID'),
  type: z.string().describe('Workflow type name'),
  status: z.string().describe('Execution status'),
  task_queue: z.string().describe('Task queue name'),
  start_time: z.string().describe('ISO 8601 start timestamp'),
  execution_time: z.string().describe('ISO 8601 execution timestamp'),
  close_time: z.string().describe('ISO 8601 close timestamp (empty if running)'),
  history_length: z.string().describe('Number of events in history'),
  history_size_bytes: z.string().describe('History size in bytes'),
  state_transition_count: z.string().describe('Number of state transitions'),
  first_run_id: z.string().describe('First run ID in the chain'),
  execution_timeout: z.string().describe('Workflow execution timeout'),
  run_timeout: z.string().describe('Workflow run timeout'),
  task_timeout: z.string().describe('Workflow task timeout'),
  memo: z.record(z.string(), z.string()).describe('Memo fields'),
  search_attributes: z.record(z.string(), z.string()).describe('Search attributes (decoded)'),
  parent_workflow_id: z.string().describe('Parent workflow ID (empty if none)'),
  parent_run_id: z.string().describe('Parent run ID (empty if none)'),
});

export interface RawWorkflowDetail {
  workflowExecutionInfo?: RawWorkflowExecution & {
    historySizeBytes?: string;
    stateTransitionCount?: string;
    firstRunId?: string;
    searchAttributes?: {
      indexedFields?: Record<string, { data?: string; metadata?: { type?: string } }>;
    };
  };
  executionConfig?: {
    taskQueue?: { name?: string };
    workflowExecutionTimeout?: string;
    workflowRunTimeout?: string;
    defaultWorkflowTaskTimeout?: string;
  };
}

const decodeSearchAttributes = (
  attrs?: Record<string, { data?: string; metadata?: { type?: string } }>,
): Record<string, string> => {
  if (!attrs) return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(attrs)) {
    if (val?.data) {
      try {
        result[key] = atob(val.data);
      } catch {
        result[key] = val.data;
      }
    }
  }
  return result;
};

export const mapWorkflowDetail = (d: RawWorkflowDetail) => ({
  workflow_id: d.workflowExecutionInfo?.execution?.workflowId ?? '',
  run_id: d.workflowExecutionInfo?.execution?.runId ?? '',
  type: d.workflowExecutionInfo?.type?.name ?? '',
  status: d.workflowExecutionInfo?.status ?? '',
  task_queue: d.workflowExecutionInfo?.taskQueue ?? '',
  start_time: d.workflowExecutionInfo?.startTime ?? '',
  execution_time: d.workflowExecutionInfo?.executionTime ?? '',
  close_time: d.workflowExecutionInfo?.closeTime ?? '',
  history_length: d.workflowExecutionInfo?.historyLength ?? '0',
  history_size_bytes: d.workflowExecutionInfo?.historySizeBytes ?? '0',
  state_transition_count: d.workflowExecutionInfo?.stateTransitionCount ?? '0',
  first_run_id: d.workflowExecutionInfo?.firstRunId ?? '',
  execution_timeout: d.executionConfig?.workflowExecutionTimeout ?? '0s',
  run_timeout: d.executionConfig?.workflowRunTimeout ?? '0s',
  task_timeout: d.executionConfig?.defaultWorkflowTaskTimeout ?? '10s',
  memo: decodeMemo(d.workflowExecutionInfo?.memo),
  search_attributes: decodeSearchAttributes(d.workflowExecutionInfo?.searchAttributes?.indexedFields),
  parent_workflow_id: d.workflowExecutionInfo?.parentExecution?.workflowId ?? '',
  parent_run_id: d.workflowExecutionInfo?.parentExecution?.runId ?? '',
});

// --- History Event ---

export const historyEventSchema = z.object({
  event_id: z.string().describe('Event ID (sequential number)'),
  event_type: z.string().describe('Event type (e.g., EVENT_TYPE_WORKFLOW_EXECUTION_STARTED)'),
  event_time: z.string().describe('ISO 8601 timestamp'),
  attributes: z.record(z.string(), z.unknown()).describe('Event-specific attributes'),
});

export interface RawHistoryEvent {
  eventId?: string;
  eventType?: string;
  eventTime?: string;
  [key: string]: unknown;
}

const KNOWN_NON_ATTRIBUTE_KEYS = new Set([
  'eventId',
  'eventType',
  'eventTime',
  'version',
  'taskId',
  'workerMayIgnore',
  'links',
]);

export const mapHistoryEvent = (e: RawHistoryEvent) => {
  const attributes: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(e)) {
    if (!KNOWN_NON_ATTRIBUTE_KEYS.has(key) && key.endsWith('Attributes') && val) {
      Object.assign(attributes, val as Record<string, unknown>);
    }
  }
  return {
    event_id: e.eventId ?? '',
    event_type: e.eventType ?? '',
    event_time: e.eventTime ?? '',
    attributes,
  };
};

// --- Schedule ---

export const scheduleSchema = z.object({
  schedule_id: z.string().describe('Schedule ID'),
  workflow_type: z.string().describe('Workflow type that this schedule starts'),
  task_queue: z.string().describe('Task queue for scheduled workflows'),
  spec_summary: z.string().describe('Human-readable schedule spec (interval or cron)'),
  overlap_policy: z.string().describe('Overlap policy'),
  state: z.string().describe('Schedule state (active/paused)'),
  recent_actions_count: z.number().int().describe('Number of recent actions'),
  next_action_times: z.array(z.string()).describe('Next scheduled action times (ISO 8601)'),
});

interface ScheduleSpec {
  interval?: Array<{ interval?: string; phase?: string }>;
  calendar?: Array<{ dayOfWeek?: string; hour?: string; minute?: string }>;
  cronExpressions?: string[];
}

export interface RawScheduleListEntry {
  scheduleId?: string;
  info?: {
    spec?: ScheduleSpec;
    workflowType?: { name?: string };
    recentActions?: Array<unknown>;
    futureActionTimes?: string[];
  };
}

const formatSpec = (spec?: ScheduleSpec): string => {
  if (!spec) return '';
  if (spec.cronExpressions?.length) return spec.cronExpressions.join(', ');
  if (spec.interval?.length) {
    return spec.interval.map((i: { interval?: string }) => `every ${i.interval ?? '?'}`).join(', ');
  }
  if (spec.calendar?.length) return 'calendar-based';
  return '';
};

export const mapScheduleListEntry = (s: RawScheduleListEntry) => ({
  schedule_id: s.scheduleId ?? '',
  workflow_type: s.info?.workflowType?.name ?? '',
  task_queue: '',
  spec_summary: formatSpec(s.info?.spec),
  overlap_policy: '',
  state: 'active',
  recent_actions_count: s.info?.recentActions?.length ?? 0,
  next_action_times: s.info?.futureActionTimes ?? [],
});

// --- Schedule Detail ---

export const scheduleDetailSchema = z.object({
  schedule_id: z.string().describe('Schedule ID'),
  workflow_type: z.string().describe('Workflow type that this schedule starts'),
  workflow_id: z.string().describe('Workflow ID pattern'),
  task_queue: z.string().describe('Task queue for scheduled workflows'),
  spec_summary: z.string().describe('Human-readable schedule spec'),
  overlap_policy: z.string().describe('Overlap policy'),
  catchup_window: z.string().describe('Catchup window duration'),
  paused: z.boolean().describe('Whether the schedule is paused'),
  notes: z.string().describe('Schedule notes'),
  action_count: z.string().describe('Total number of actions taken'),
  recent_actions: z
    .array(
      z.object({
        schedule_time: z.string().describe('Scheduled time (ISO 8601)'),
        actual_time: z.string().describe('Actual execution time (ISO 8601)'),
        workflow_id: z.string().describe('Resulting workflow ID'),
        run_id: z.string().describe('Resulting run ID'),
        status: z.string().describe('Workflow execution status'),
      }),
    )
    .describe('Recent schedule actions'),
  next_action_times: z.array(z.string()).describe('Next scheduled action times (ISO 8601)'),
});

export interface RawScheduleDetail {
  schedule?: {
    spec?: ScheduleSpec;
    action?: {
      startWorkflow?: {
        workflowId?: string;
        workflowType?: { name?: string };
        taskQueue?: { name?: string };
      };
    };
    policies?: { overlapPolicy?: string; catchupWindow?: string };
    state?: { paused?: boolean; notes?: string };
  };
  info?: {
    actionCount?: string;
    recentActions?: Array<{
      scheduleTime?: string;
      actualTime?: string;
      startWorkflowResult?: { workflowId?: string; runId?: string };
      startWorkflowStatus?: string;
    }>;
    futureActionTimes?: string[];
  };
}

export const mapScheduleDetail = (d: RawScheduleDetail, scheduleId: string) => ({
  schedule_id: scheduleId,
  workflow_type: d.schedule?.action?.startWorkflow?.workflowType?.name ?? '',
  workflow_id: d.schedule?.action?.startWorkflow?.workflowId ?? '',
  task_queue: d.schedule?.action?.startWorkflow?.taskQueue?.name ?? '',
  spec_summary: formatSpec(d.schedule?.spec),
  overlap_policy: d.schedule?.policies?.overlapPolicy ?? '',
  catchup_window: d.schedule?.policies?.catchupWindow ?? '',
  paused: d.schedule?.state?.paused ?? false,
  notes: d.schedule?.state?.notes ?? '',
  action_count: d.info?.actionCount ?? '0',
  recent_actions: (d.info?.recentActions ?? []).map(a => ({
    schedule_time: a.scheduleTime ?? '',
    actual_time: a.actualTime ?? '',
    workflow_id: a.startWorkflowResult?.workflowId ?? '',
    run_id: a.startWorkflowResult?.runId ?? '',
    status: a.startWorkflowStatus ?? '',
  })),
  next_action_times: d.info?.futureActionTimes ?? [],
});

// --- Task Queue ---

export const taskQueuePollerSchema = z.object({
  identity: z.string().describe('Worker identity'),
  last_access_time: z.string().describe('Last poll time (ISO 8601)'),
  rate_per_second: z.number().describe('Worker rate per second'),
  worker_version_capabilities_build_id: z.string().describe('Worker build ID'),
});

export interface RawPoller {
  identity?: string;
  lastAccessTime?: string;
  ratePerSecond?: number;
  workerVersionCapabilities?: { buildId?: string };
}

export const mapPoller = (p: RawPoller) => ({
  identity: p.identity ?? '',
  last_access_time: p.lastAccessTime ?? '',
  rate_per_second: p.ratePerSecond ?? 0,
  worker_version_capabilities_build_id: p.workerVersionCapabilities?.buildId ?? '',
});
