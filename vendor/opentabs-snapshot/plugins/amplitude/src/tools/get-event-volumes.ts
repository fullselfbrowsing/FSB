import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { volumeSchema } from './schemas.js';

const QUERY = `query OrgEventVolumesByMonth($intervalStart: String!, $intervalEnd: String!) {
  orgEventVolumesByMonth(intervalStart: $intervalStart, intervalEnd: $intervalEnd) {
    intervalStart intervalEnd month totalEvents ingestedEvents billedEvents
  }
}`;

export const getEventVolumes = defineTool({
  name: 'get_event_volumes',
  displayName: 'Get Event Volumes',
  description:
    'Get monthly event ingestion volumes for the organization within a date range. Shows total, ingested, and billed event counts per month.',
  summary: 'Get monthly event volume metrics',
  icon: 'bar-chart-3',
  group: 'Usage',
  input: z.object({
    interval_start: z.string().describe('Start date in YYYY-MM-DD format (e.g., "2026-01-01")'),
    interval_end: z.string().describe('End date in YYYY-MM-DD format (e.g., "2026-03-31")'),
  }),
  output: z.object({
    volumes: z.array(volumeSchema).describe('Monthly event volume data'),
  }),
  handle: async params => {
    const data = await gql<{
      orgEventVolumesByMonth: Array<{
        month?: string;
        totalEvents?: number;
        billedEvents?: number;
      }>;
    }>('OrgEventVolumesByMonth', QUERY, {
      intervalStart: params.interval_start,
      intervalEnd: params.interval_end,
    });
    return {
      volumes: (data.orgEventVolumesByMonth ?? []).map(v => ({
        month: v.month ?? '',
        total: v.totalEvents ?? 0,
        billed: v.billedEvents ?? 0,
      })),
    };
  },
});
