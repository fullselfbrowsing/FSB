import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawSchedule, mapSchedule, scheduleSchema } from './schemas.js';

export const updateSchedule = defineTool({
  name: 'update_schedule',
  displayName: 'Update Schedule',
  description: 'Update a scheduled pipeline trigger. Only provided fields are changed.',
  summary: 'Update a scheduled trigger',
  icon: 'pencil',
  group: 'Schedules',
  input: z.object({
    schedule_id: z.string().describe('Schedule UUID'),
    name: z.string().optional().describe('Schedule name'),
    description: z.string().optional().describe('Schedule description'),
    attribution_actor: z
      .enum(['current', 'system'])
      .optional()
      .describe('Who the pipeline runs as ("current" for your user, "system" for system)'),
    timetable: z
      .object({
        per_hour: z.number().int().min(1).max(60).optional().describe('Triggers per hour (1-60)'),
        hours_of_day: z.array(z.number().int().min(0).max(23)).optional().describe('Hours of day to run (0-23)'),
        days_of_week: z
          .array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']))
          .optional()
          .describe('Days of week'),
        days_of_month: z.array(z.number().int().min(1).max(31)).optional().describe('Days of month (1-31)'),
        months: z
          .array(z.enum(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']))
          .optional()
          .describe('Months of year'),
      })
      .optional()
      .describe('Schedule timetable'),
    parameters: z.record(z.string(), z.unknown()).optional().describe('Pipeline parameters'),
  }),
  output: z.object({
    schedule: scheduleSchema.describe('Updated schedule'),
  }),
  handle: async ({ schedule_id, name, description, attribution_actor, timetable, parameters }) => {
    const data = await api<RawSchedule>(`/schedule/${schedule_id}`, {
      method: 'PATCH',
      body: stripUndefined({
        name,
        description,
        'attribution-actor': attribution_actor,
        timetable,
        parameters,
      }),
    });
    return { schedule: mapSchedule(data) };
  },
});
