import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const getBlocks = defineTool({
  name: 'get_blocks',
  displayName: 'Get Blocks',
  description: 'Get the list of accounts blocked by the authenticated user. Supports cursor-based pagination.',
  summary: 'Get blocked accounts',
  icon: 'shield-off',
  group: 'Social Graph',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .optional()
      .describe('Number of blocked accounts to return (1-100, default 50)'),
  }),
  output: z.object({
    profiles: z.array(profileSchema).describe('List of blocked profiles'),
    cursor: z.string().describe('Pagination cursor for the next page (empty if no more results)'),
  }),
  handle: async params => {
    const data = await api<{ blocks: Record<string, unknown>[]; cursor?: string }>('app.bsky.graph.getBlocks', {
      query: { cursor: params.cursor, limit: params.limit },
    });

    return {
      profiles: data.blocks.map(mapProfile),
      cursor: data.cursor ?? '',
    };
  },
});
