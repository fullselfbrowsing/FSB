import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { volumeSchema } from './schemas.js';

const QUERY = `query OrgSessionReplayVolumesByMonth($intervalStart: String!, $intervalEnd: String!) {
  orgSessionReplayVolumesByMonth(intervalStart: $intervalStart, intervalEnd: $intervalEnd) {
    month totalSessionReplays billedSessionReplays
  }
}`;

export const getSessionReplayVolumes = defineTool({
  name: 'get_session_replay_volumes',
  displayName: 'Get Session Replay Volumes',
  description: 'Get monthly session replay volumes for the organization within a date range.',
  summary: 'Get monthly session replay volume metrics',
  icon: 'monitor-play',
  group: 'Usage',
  input: z.object({
    interval_start: z.string().describe('Start date in YYYY-MM-DD format (e.g., "2026-01-01")'),
    interval_end: z.string().describe('End date in YYYY-MM-DD format (e.g., "2026-03-31")'),
  }),
  output: z.object({
    volumes: z.array(volumeSchema).describe('Monthly session replay volume data'),
  }),
  handle: async params => {
    const data = await gql<{
      orgSessionReplayVolumesByMonth: Array<{
        month?: string;
        totalSessionReplays?: number;
        billedSessionReplays?: number;
      }>;
    }>('OrgSessionReplayVolumesByMonth', QUERY, {
      intervalStart: params.interval_start,
      intervalEnd: params.interval_end,
    });
    return {
      volumes: (data.orgSessionReplayVolumesByMonth ?? []).map(v => ({
        month: v.month ?? '',
        total: v.totalSessionReplays ?? 0,
        billed: v.billedSessionReplays ?? 0,
      })),
    };
  },
});
