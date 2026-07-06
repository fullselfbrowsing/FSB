import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';

const monitorSchema = z.object({
  id: z.string().describe('Monitor ID'),
  name: z.string().describe('Monitor name'),
  slug: z.string().describe('Monitor slug'),
  status: z.string().describe('Monitor status (active, disabled, ok, error, missed_checkin)'),
  type: z.string().describe('Monitor type (e.g., "cron_job")'),
  schedule: z.string().describe('Cron schedule expression or interval description'),
  date_created: z.string().describe('ISO 8601 timestamp when the monitor was created'),
  project_slug: z.string().describe('Project slug the monitor belongs to'),
});

export const listMonitors = defineTool({
  name: 'list_monitors',
  displayName: 'List Monitors',
  description:
    'List cron monitors for the current Sentry organization. Monitors track scheduled jobs (crons) ' +
    'and alert when check-ins are missed or fail.',
  summary: 'List cron monitors in the organization',
  icon: 'clock',
  group: 'Monitors',
  input: z.object({
    limit: z.number().optional().describe('Maximum number of monitors to return (default 25, max 100)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    monitors: z.array(monitorSchema).describe('List of cron monitors'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(`/organizations/${orgSlug}/monitors/`, {
      query: { per_page: params.limit, cursor: params.cursor },
    });
    return {
      cursor: nextCursor ?? '',
      monitors: (Array.isArray(data) ? data : []).map(m => {
        const config = (m.config as Record<string, unknown>) ?? {};
        const project = (m.project as Record<string, unknown>) ?? {};
        const scheduleType = config.schedule_type as string;
        let schedule = '';
        if (scheduleType === 'crontab') {
          schedule = (config.schedule as string) ?? '';
        } else {
          const val = (config.schedule as number) ?? 0;
          const unit = (config.schedule_type as string) ?? 'minute';
          schedule = `every ${val} ${unit}(s)`;
        }
        return {
          id: (m.id as string) ?? '',
          name: (m.name as string) ?? '',
          slug: (m.slug as string) ?? '',
          status: (m.status as string) ?? '',
          type: (m.type as string) ?? 'cron_job',
          schedule,
          date_created: (m.dateCreated as string) ?? '',
          project_slug: (project.slug as string) ?? '',
        };
      }),
    };
  },
});
