import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../clickhouse-api.js';
import { mapMetricDataPoint, metricDataPointSchema } from './schemas.js';

const metricTypes = ['ALLOCATED_MEMORY', 'CPU_USAGE', 'MEMORY_USAGE', 'QUERIES_PER_SECOND'] as const;

const timePeriods = ['LAST_HOUR', 'LAST_DAY', 'LAST_WEEK', 'LAST_MONTH'] as const;

interface MetricBatchResponse {
  batch?: Array<{
    type?: string;
    timePeriod?: string;
    data?: Array<Array<[number, number]>>;
  }>;
}

export const queryMetrics = defineTool({
  name: 'query_metrics',
  displayName: 'Query Metrics',
  description:
    'Query health and performance metrics for a ClickHouse Cloud service. Available metric types: ALLOCATED_MEMORY (bytes), CPU_USAGE (percentage), MEMORY_USAGE (bytes), QUERIES_PER_SECOND. Time periods: LAST_HOUR, LAST_DAY, LAST_WEEK, LAST_MONTH.',
  summary: 'Get service health metrics',
  icon: 'activity',
  group: 'Monitoring',
  input: z.object({
    service_id: z.string().describe('Service UUID'),
    metric_type: z.enum(metricTypes).describe('Metric type to query'),
    time_period: z.enum(timePeriods).optional().describe('Time period (default LAST_HOUR)'),
  }),
  output: z.object({
    data_points: z.array(metricDataPointSchema),
    metric_type: z.string(),
    time_period: z.string(),
  }),
  handle: async params => {
    const orgId = getOrgId();
    if (!orgId) throw ToolError.auth('No organization selected — please open ClickHouse Cloud console.');

    const period = params.time_period ?? 'LAST_HOUR';

    const data = await api<MetricBatchResponse>('/api/metrics/queryMetrics', {
      body: {
        organizationId: orgId,
        instanceId: params.service_id,
        batch: [{ type: params.metric_type, timePeriod: period }],
      },
    });

    const batchEntry = data.batch?.[0];
    const rawPoints = batchEntry?.data?.[0] ?? [];

    return {
      data_points: rawPoints.map(mapMetricDataPoint),
      metric_type: params.metric_type,
      time_period: period,
    };
  },
});
