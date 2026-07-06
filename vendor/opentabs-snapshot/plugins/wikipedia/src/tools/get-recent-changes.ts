import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { recentChangeSchema, mapRecentChange } from './schemas.js';
import type { RawRecentChange } from './schemas.js';

interface RecentChangesResponse {
  query?: {
    recentchanges?: RawRecentChange[];
  };
}

export const getRecentChanges = defineTool({
  name: 'get_recent_changes',
  displayName: 'Get Recent Changes',
  description:
    'Get recent edits made across Wikipedia. Returns article titles, editors, timestamps, edit summaries, and size changes. Filtered to article namespace (main content) edits only.',
  summary: 'List recent edits across Wikipedia',
  icon: 'clock',
  group: 'Activity',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of recent changes to return (default 20, max 50)'),
  }),
  output: z.object({
    changes: z.array(recentChangeSchema),
  }),
  handle: async params => {
    const data = await api<RecentChangesResponse>({
      action: 'query',
      list: 'recentchanges',
      rclimit: params.limit ?? 20,
      rcprop: 'user|timestamp|title|comment|sizes',
      rctype: 'edit',
      rcnamespace: 0,
    });

    return {
      changes: (data.query?.recentchanges ?? []).map(mapRecentChange),
    };
  },
});
