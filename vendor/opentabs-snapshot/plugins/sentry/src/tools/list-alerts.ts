import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';

const alertRuleSchema = z.object({
  id: z.string().describe('Alert rule ID'),
  name: z.string().describe('Alert rule name'),
  status: z.string().describe('Alert rule status (active, disabled)'),
  date_created: z.string().describe('ISO 8601 timestamp when the alert was created'),
  project_slug: z.string().describe('Project slug the alert belongs to'),
  type: z.string().describe('Alert type (e.g., issue, metric)'),
});

type AlertRule = z.infer<typeof alertRuleSchema>;

const mapAlertRule = (a: Record<string, unknown> | undefined): AlertRule => {
  const projects = (a?.projects as string[]) ?? [];
  return {
    id: (a?.id as string) ?? '',
    name: (a?.name as string) ?? '',
    status: (a?.status as string) ?? '',
    date_created: (a?.dateCreated as string) ?? '',
    project_slug: projects[0] ?? '',
    type: (a?.type as string) ?? 'issue',
  };
};

export const listAlerts = defineTool({
  name: 'list_alerts',
  displayName: 'List Alerts',
  description:
    'List alert rules for the current Sentry organization. Returns alert name, status, type, and associated project.',
  summary: 'List alert rules in the organization',
  icon: 'bell',
  group: 'Alerts',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    alerts: z.array(alertRuleSchema).describe('List of alert rules'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(
      `/organizations/${orgSlug}/combined-rules/`,
      {
        query: { cursor: params.cursor },
      },
    );
    return {
      alerts: (Array.isArray(data) ? data : []).map(a => mapAlertRule(a)),
      cursor: nextCursor ?? '',
    };
  },
});
