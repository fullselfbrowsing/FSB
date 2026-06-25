import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { alarmSchema, mapAlarm, normalizeList } from './schemas.js';
import type { RawAlarm } from './schemas.js';

export const listAlarms = defineTool({
  name: 'list_alarms',
  displayName: 'List CloudWatch Alarms',
  description:
    'List CloudWatch metric alarms in the current region. Returns alarm name, state, metric name, and namespace. Supports filtering by state (OK, ALARM, INSUFFICIENT_DATA).',
  summary: 'List CloudWatch alarms in the current region',
  icon: 'bell',
  group: 'CloudWatch',
  input: z.object({
    state_value: z
      .enum(['OK', 'ALARM', 'INSUFFICIENT_DATA'])
      .optional()
      .describe('Filter by alarm state (OK, ALARM, or INSUFFICIENT_DATA)'),
    max_records: z.number().int().min(1).max(100).optional().describe('Maximum alarms to return (default 50)'),
  }),
  output: z.object({
    alarms: z.array(alarmSchema).describe('List of CloudWatch alarms'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {};
    if (params.state_value) queryParams.StateValue = params.state_value;
    if (params.max_records) queryParams.MaxRecords = String(params.max_records);

    const data = await awsApi('monitoring', 'DescribeAlarms', queryParams, { version: '2010-08-01' });
    const result = (data as Record<string, unknown>).DescribeAlarmsResult as Record<string, unknown> | undefined;
    const metricAlarms = result?.MetricAlarms as Record<string, unknown> | undefined;
    const items = normalizeList(metricAlarms?.member as RawAlarm[]);
    return { alarms: items.map(mapAlarm) };
  },
});
