import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { trendSchema, mapTrend } from './schemas.js';
import type { RawTrendItem } from './schemas.js';

export const getTrending = defineTool({
  name: 'get_trending',
  displayName: 'Get Trending',
  description: 'Get current trending topics and hashtags.',
  summary: 'Get trending topics',
  icon: 'trending-up',
  group: 'Explore',
  input: z.object({}),
  output: z.object({
    trends: z.array(trendSchema),
  }),
  handle: async () => {
    const data = await graphqlQuery<{
      data: {
        explore_sidebar: {
          timeline: {
            instructions: Array<{
              entries?: Array<{
                content?: { items?: RawTrendItem[] };
              }>;
            }>;
          };
        };
      };
    }>('ExploreSidebar', {});

    const instructions = data.data.explore_sidebar.timeline.instructions;

    const trends: Array<z.output<typeof trendSchema>> = [];
    for (const instruction of instructions) {
      if (!Array.isArray(instruction.entries)) continue;
      for (const entry of instruction.entries) {
        const items = entry.content?.items;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          trends.push(mapTrend(item));
        }
      }
    }

    return { trends };
  },
});
