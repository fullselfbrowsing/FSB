import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawSchedule, mapSchedule, scheduleSchema } from './schemas.js';

export const createSchedule = defineTool({
  name: 'create_schedule',
  displayName: 'Create Schedule',
  description: 'Create a scheduled pipeline trigger for a project. Requires a timetable specifying when to run.',
  summary: 'Create a scheduled trigger',
  icon: 'plus',
  group: 'Schedules',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    name: z.string().describe('Schedule name'),
    description: z.string().optional().describe('Schedule description'),
    attribution_actor: z
      .enum(['current', 'system'])
      .describe('Who the pipeline runs as ("current" for your user, "system" for system)'),
    timetable: z
      .object({
        per_hour: z.number().int().min(1).max(60).describe('Triggers per hour (1-60)'),
        hours_of_day: z.array(z.number().int().min(0).max(23)).describe('Hours of day to run (0-23)'),
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
      .describe('Schedule timetable'),
    parameters: z.record(z.string(), z.unknown()).optional().describe('Pipeline parameters'),
  }),
  output: z.object({
    schedule: scheduleSchema.describe('Created schedule'),
  }),
  handle: async ({ project_slug, name, description, attribution_actor, timetable, parameters }) => {
    const data = await api<RawSchedule>(`/project/${project_slug}/schedule`, {
      method: 'POST',
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
