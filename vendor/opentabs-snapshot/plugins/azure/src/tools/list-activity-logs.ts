import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawActivityLog, mapActivityLog, activityLogSchema } from './schemas.js';

export const listActivityLogs = defineTool({
  name: 'list_activity_logs',
  displayName: 'List Activity Logs',
  description:
    "Query activity log events for a subscription. Use the filter parameter with OData syntax to filter by time range, resource group, or status. Example filter: \"eventTimestamp ge '2024-01-01T00:00:00Z' and eventTimestamp le '2024-01-31T23:59:59Z'\".",
  summary: 'Query activity log events',
  icon: 'scroll-text',
  group: 'Activity Log',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    filter: z
      .string()
      .describe(
        'OData filter expression (required). Must include eventTimestamp filter, e.g., "eventTimestamp ge \'2024-01-01\'"',
      ),
    select: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to return (e.g., "eventTimestamp,operationName,status")'),
  }),
  output: z.object({
    events: z.array(activityLogSchema).describe('List of activity log events'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawActivityLog>>(
      `/subscriptions/${params.subscription_id}/providers/Microsoft.Insights/eventtypes/management/values`,
      {
        apiVersion: '2015-04-01',
        query: { $filter: params.filter, $select: params.select },
      },
    );
    return { events: (data.value ?? []).map(mapActivityLog) };
  },
});
