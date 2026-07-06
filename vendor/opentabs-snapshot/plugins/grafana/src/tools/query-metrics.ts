// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../grafana-api.js';

export const queryMetrics = defineTool({
  name: 'query_metrics',
  displayName: 'Query Metrics',
  description: 'Run a metric query against a Grafana data source and return the timeseries result over a time range.',
  summary: 'query metrics on grafana',
  icon: 'activity',
  group: 'Metrics',
  input: z.object({
    datasource: z.string().min(1).describe('The data source UID or name to query'),
    query: z.string().min(1).describe('The query expression (e.g. a PromQL/Loki expression)'),
    from: z.string().optional().describe('Range start (ISO timestamp or relative, e.g. now-6h)'),
    to: z.string().optional().describe('Range end (ISO timestamp or relative, e.g. now)'),
  }),
  output: z.object({
    series: z.array(z.object({
      metric: z.string(),
      points: z.number(),
    })).describe('The timeseries result'),
  }),
  handle: async (params: { datasource: string; query: string; from?: string; to?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /api/ds/query (default method, a READ).
    const data = await api<{ series: unknown[] }>('/api/ds/query', {
      query: { datasource: params.datasource, query: params.query, from: params.from, to: params.to },
    });
    return { series: data.series as { metric: string; points: number }[] };
  },
});
