import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';

interface HogQLResponse {
  columns?: string[];
  results?: unknown[][];
  types?: Array<[string, string]>;
  hogql?: string;
  error?: string;
}

export const runQuery = defineTool({
  name: 'run_query',
  displayName: 'Run HogQL Query',
  description:
    'Execute a HogQL (SQL-like) query against PostHog event data. HogQL supports SELECT, aggregations (count, uniqExact, avg, sum, min, max), GROUP BY, ORDER BY, WHERE, and JOIN. Query the `events` table for raw events, `persons` for person data. Example: "SELECT event, count() as total FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY total DESC LIMIT 20".',
  summary: 'Run a HogQL analytics query',
  icon: 'database',
  group: 'Query',
  input: z.object({
    query: z.string().describe('HogQL query string (SQL-like syntax over PostHog data)'),
  }),
  output: z.object({
    columns: z.array(z.string()).describe('Column names in the result set'),
    results: z.array(z.array(z.unknown())).describe('Result rows — each row is an array of values matching columns'),
    types: z.array(z.array(z.string())).describe('Column type pairs: [[column_name, type], ...]'),
    hogql: z.string().describe('The compiled HogQL query that was executed'),
  }),
  handle: async params => {
    const teamId = getTeamId();
    const data = await api<HogQLResponse>(`/api/environments/${teamId}/query/`, {
      method: 'POST',
      body: {
        query: {
          kind: 'HogQLQuery',
          query: params.query,
        },
      },
    });

    if (data.error) {
      throw new Error(`HogQL query error: ${data.error}`);
    }

    return {
      columns: data.columns ?? [],
      results: data.results ?? [],
      types: (data.types ?? []).map(t => [t[0] ?? '', t[1] ?? '']),
      hogql: data.hogql ?? '',
    };
  },
});
