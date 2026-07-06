import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam, historyEventSchema, mapHistoryEvent, type RawHistoryEvent } from './schemas.js';

export const getWorkflowHistory = defineTool({
  name: 'get_workflow_history',
  displayName: 'Get Workflow History',
  description:
    'Get the event history for a workflow execution. Events include workflow started, activity scheduled/started/completed/failed, timer fired, signals received, and more. Essential for debugging workflow behavior and understanding failures.',
  summary: 'Get workflow event history for debugging',
  icon: 'clock',
  group: 'Workflows',
  input: z.object({
    namespace: namespaceParam,
    workflow_id: z.string().describe('Workflow ID'),
    run_id: z.string().optional().describe('Run ID (optional — uses latest run if omitted)'),
    page_size: z.number().int().min(1).max(1000).optional().describe('Max events per page (default 100, max 1000)'),
    next_page_token: z.string().optional().describe('Pagination token from a previous response'),
    wait_new_event: z.boolean().optional().describe('Long-poll for new events (default false)'),
  }),
  output: z.object({
    events: z.array(historyEventSchema).describe('History events'),
    next_page_token: z.string().describe('Token for next page (empty if no more events)'),
  }),
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<{
      history?: { events?: RawHistoryEvent[] };
      nextPageToken?: string;
    }>(ns, `/namespaces/${ns}/workflows/${encodeURIComponent(params.workflow_id)}/history`, {
      'execution.runId': params.run_id,
      maximumPageSize: params.page_size ?? 100,
      nextPageToken: params.next_page_token,
      waitNewEvent: params.wait_new_event,
    });

    return {
      events: (data.history?.events ?? []).map(mapHistoryEvent),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
