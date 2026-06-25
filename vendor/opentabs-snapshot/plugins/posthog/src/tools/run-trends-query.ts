import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';

interface TrendsResult {
  label?: string;
  count?: number;
  data?: number[];
  days?: string[];
  labels?: string[];
  action?: { id?: string; name?: string; type?: string };
}

interface TrendsResponse {
  results?: TrendsResult[];
  error?: string;
}

const trendsResultSchema = z.object({
  label: z.string().describe('Series label'),
  count: z.number().describe('Total count across the date range'),
  data: z.array(z.number()).describe('Data points per interval'),
  days: z.array(z.string()).describe('Date labels per interval (YYYY-MM-DD)'),
});

export const runTrendsQuery = defineTool({
  name: 'run_trends_query',
  displayName: 'Run Trends Query',
  description:
    'Run a time series trends query over events. Returns data points per interval (day, week, month, hour). Supports multiple series, math aggregations (total, unique users, average, sum, min, max), and breakdowns by property. Easier to use than raw HogQL for standard time series charts.',
  summary: 'Run a time series trends query',
  icon: 'trending-up',
  group: 'Query',
  input: z.object({
    event: z.string().describe('Event name to trend (e.g., "$pageview", "server_started")'),
    math: z
      .enum([
        'total',
        'dau',
        'weekly_active',
        'monthly_active',
        'unique_group',
        'avg',
        'sum',
        'min',
        'max',
        'median',
        'p90',
        'p95',
        'p99',
      ])
      .optional()
      .describe(
        'Math aggregation: "total" (event count, default), "dau" (unique users), or property aggregations like "avg", "sum", "min", "max", "median", "p90", "p95", "p99"',
      ),
    math_property: z
      .string()
      .optional()
      .describe('Property to aggregate when using property math (avg, sum, min, max, etc.)'),
    date_from: z
      .string()
      .optional()
      .describe('Start date — relative ("-7d", "-30d", "-1mStart") or ISO 8601. Default: "-7d"'),
    date_to: z.string().optional().describe('End date — relative or ISO 8601. Default: now'),
    interval: z
      .enum(['hour', 'day', 'week', 'month'])
      .optional()
      .describe('Time interval for data points (default "day")'),
    breakdown: z
      .string()
      .optional()
      .describe('Property name to break down by (e.g., "$browser", "os", "$referring_domain")'),
    breakdown_type: z
      .enum(['event', 'person', 'session', 'group', 'hogql'])
      .optional()
      .describe('Breakdown property type (default "event")'),
  }),
  output: z.object({
    results: z.array(trendsResultSchema).describe('Trend series results — one per series/breakdown value'),
  }),
  handle: async params => {
    const teamId = getTeamId();

    const series: Record<string, unknown> = {
      kind: 'EventsNode',
      event: params.event,
      math: params.math ?? 'total',
    };
    if (params.math_property) {
      series.math_property = params.math_property;
    }

    const query: Record<string, unknown> = {
      kind: 'TrendsQuery',
      series: [series],
      dateRange: {
        date_from: params.date_from ?? '-7d',
        date_to: params.date_to,
      },
      interval: params.interval ?? 'day',
    };

    if (params.breakdown) {
      query.breakdownFilter = {
        breakdowns: [
          {
            property: params.breakdown,
            type: params.breakdown_type ?? 'event',
          },
        ],
      };
    }

    const data = await api<TrendsResponse>(`/api/environments/${teamId}/query/`, {
      method: 'POST',
      body: { query },
    });

    if (data.error) {
      throw new Error(`Trends query error: ${data.error}`);
    }

    return {
      results: (data.results ?? []).map(r => ({
        label: r.label ?? '',
        count: r.count ?? 0,
        data: r.data ?? [],
        days: r.days ?? [],
      })),
    };
  },
});
