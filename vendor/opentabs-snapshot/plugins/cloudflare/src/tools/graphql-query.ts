import { ToolError, defineTool, postJSON } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getAtokHeader } from '../cloudflare-api.js';

export const graphqlQuery = defineTool({
  name: 'graphql_query',
  displayName: 'GraphQL Query',
  description:
    'Execute a GraphQL query against the Cloudflare Analytics API. Use this for analytics data, traffic stats, firewall events, DNS analytics, and other metrics not available via REST endpoints. Common query fields: httpRequests1dGroups (daily HTTP stats), firewallEventsAdaptiveGroups (WAF events), httpRequestsAdaptiveGroups (detailed traffic). Pass the zone tag as a filter. Example query: { viewer { zones(filter: { zoneTag: "ZONE_ID" }) { httpRequests1dGroups(limit: 7, filter: { date_geq: "2026-03-01" }) { dimensions { date } sum { requests pageViews } } } } }',
  summary: 'Execute a GraphQL analytics query',
  icon: 'bar-chart-3',
  group: 'Analytics',
  input: z.object({
    query: z.string().describe('GraphQL query string'),
    variables: z.record(z.string(), z.unknown()).optional().describe('GraphQL variables (optional)'),
  }),
  output: z.object({
    data: z.unknown().describe('GraphQL response data'),
    errors: z.array(z.unknown()).nullable().describe('GraphQL errors, or null if successful'),
  }),
  handle: async params => {
    const atok = getAtokHeader();
    if (!atok) throw ToolError.auth('Not authenticated — please log in to Cloudflare.');

    const body: Record<string, unknown> = { query: params.query };
    if (params.variables) body.variables = params.variables;

    // GraphQL endpoint returns { data, errors } directly — not the standard Cloudflare envelope.
    const result = await postJSON<{ data?: unknown; errors?: unknown[] }>('/api/v4/graphql', body, {
      headers: { 'x-atok': atok },
    });

    return {
      data: result?.data ?? null,
      errors: Array.isArray(result?.errors) ? result.errors : null,
    };
  },
});
