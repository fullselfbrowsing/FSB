import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { volumeSchema } from './schemas.js';

const QUERY = `query OrgMTUVolumesByMonth($intervalStart: String!, $intervalEnd: String!) {
  orgMTUVolumesByMonth(intervalStart: $intervalStart, intervalEnd: $intervalEnd) {
    intervalStart intervalEnd month totalMTUs billedMTUs
  }
}`;

export const getMtuVolumes = defineTool({
  name: 'get_mtu_volumes',
  displayName: 'Get MTU Volumes',
  description:
    'Get monthly tracked user (MTU) volumes for the organization within a date range. Shows total and billed MTU counts per month.',
  summary: 'Get monthly tracked user volume metrics',
  icon: 'users',
  group: 'Usage',
  input: z.object({
    interval_start: z.string().describe('Start date in YYYY-MM-DD format (e.g., "2026-01-01")'),
    interval_end: z.string().describe('End date in YYYY-MM-DD format (e.g., "2026-03-31")'),
  }),
  output: z.object({
    volumes: z.array(volumeSchema).describe('Monthly MTU volume data'),
  }),
  handle: async params => {
    const data = await gql<{
      orgMTUVolumesByMonth: Array<{
        month?: string;
        totalMTUs?: number;
        billedMTUs?: number;
      }>;
    }>('OrgMTUVolumesByMonth', QUERY, {
      intervalStart: params.interval_start,
      intervalEnd: params.interval_end,
    });
    return {
      volumes: (data.orgMTUVolumesByMonth ?? []).map(v => ({
        month: v.month ?? '',
        total: v.totalMTUs ?? 0,
        billed: v.billedMTUs ?? 0,
      })),
    };
  },
});
