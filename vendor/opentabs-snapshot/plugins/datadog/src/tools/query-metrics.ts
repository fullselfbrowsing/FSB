// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../datadog-api.js';

export const queryMetrics = defineTool({
  name: 'query_metrics',
  displayName: 'Query Metrics',
  description: 'Query timeseries points for a Datadog metric over a time window using a metric query string.',
  summary: 'Query metric timeseries',
  icon: 'activity',
  group: 'Metrics',
  input: z.object({
    query: z.string().min(1).describe('Datadog metric query (e.g. avg:system.cpu.user{*})'),
    from: z.number().int().describe('Start of the window as a Unix timestamp (seconds)'),
    to: z.number().int().describe('End of the window as a Unix timestamp (seconds)'),
  }),
  output: z.object({
    series: z
      .array(z.object({ metric: z.string(), pointlist: z.array(z.array(z.number())) }))
      .describe('Queried metric series'),
  }),
  handle: async (params: { query: string; from: number; to: number }) => {
    // NEVER executed by the importer. Upstream: api GET /query?query=...&from=...&to=... (default method).
    const data = await api<{ series: Array<{ metric: string; pointlist: number[][] }> }>(
      `/query?query=${encodeURIComponent(params.query)}&from=${params.from}&to=${params.to}`
    );
    return data;
  },
});
