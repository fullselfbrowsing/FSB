import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam, scheduleDetailSchema, mapScheduleDetail, type RawScheduleDetail } from './schemas.js';

export const getSchedule = defineTool({
  name: 'get_schedule',
  displayName: 'Get Schedule',
  description:
    'Get detailed information about a specific schedule including its spec (interval/cron), action configuration, policies, pause state, and recent execution history.',
  summary: 'Get schedule details and recent actions',
  icon: 'calendar-clock',
  group: 'Schedules',
  input: z.object({
    namespace: namespaceParam,
    schedule_id: z.string().describe('Schedule ID'),
  }),
  output: scheduleDetailSchema,
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<RawScheduleDetail>(
      ns,
      `/namespaces/${ns}/schedules/${encodeURIComponent(params.schedule_id)}`,
    );
    return mapScheduleDetail(data, params.schedule_id);
  },
});
