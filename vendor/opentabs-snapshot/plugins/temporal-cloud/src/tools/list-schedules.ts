import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam, scheduleSchema, mapScheduleListEntry, type RawScheduleListEntry } from './schemas.js';

export const listSchedules = defineTool({
  name: 'list_schedules',
  displayName: 'List Schedules',
  description:
    'List all schedules in a namespace. Shows schedule IDs, workflow types, intervals/crons, recent action counts, and next scheduled times.',
  summary: 'List all schedules in the namespace',
  icon: 'calendar',
  group: 'Schedules',
  input: z.object({
    namespace: namespaceParam,
    page_size: z.number().int().min(1).max(200).optional().describe('Results per page (default 100, max 200)'),
    next_page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    schedules: z.array(scheduleSchema).describe('Schedule entries'),
    next_page_token: z.string().describe('Token for next page (empty if no more results)'),
  }),
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<{
      schedules?: RawScheduleListEntry[];
      nextPageToken?: string;
    }>(ns, `/namespaces/${ns}/schedules`, {
      maximumPageSize: params.page_size ?? 100,
      nextPageToken: params.next_page_token,
    });

    return {
      schedules: (data.schedules ?? []).map(mapScheduleListEntry),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
