import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawTag, mapTag, tagSchema } from './schemas.js';

export const getPopularTags = defineTool({
  name: 'get_popular_tags',
  displayName: 'Get Popular Tags',
  description:
    'Get the most popular tags on Steam. Tags categorize games by genre, theme, and features (e.g., "Indie", "Action", "Roguelike"). Useful for discovering game categories.',
  summary: 'List popular Steam store tags',
  icon: 'tags',
  group: 'Store',
  input: z.object({}),
  output: z.object({
    tags: z.array(tagSchema).describe('Popular tags sorted by popularity'),
  }),
  handle: async () => {
    const data = await storeGet<RawTag[]>('/tagdata/populartags/english');
    return { tags: (data ?? []).map(mapTag) };
  },
});
