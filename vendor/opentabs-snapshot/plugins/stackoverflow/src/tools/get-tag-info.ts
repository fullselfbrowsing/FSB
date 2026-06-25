import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { tagInfoSchema, mapTagInfo } from './schemas.js';

export const getTagInfo = defineTool({
  name: 'get_tag_info',
  displayName: 'Get Tag Info',
  description:
    'Get detailed information about a Stack Overflow tag, including its description and wiki. Tags are the primary way questions are categorized.',
  summary: 'Get tag details and wiki',
  icon: 'tag',
  group: 'Tags',
  input: z.object({
    tag: z.string().describe('Tag name (e.g., "javascript", "python", "react")'),
  }),
  output: z.object({
    tag: tagInfoSchema.describe('Tag information'),
  }),
  handle: async params => {
    const [tagData, wikiData] = await Promise.all([
      api(`/tags/${encodeURIComponent(params.tag)}/info`),
      api(`/tags/${encodeURIComponent(params.tag)}/wikis`),
    ]);
    const tagItem = tagData.items?.[0];
    if (!tagItem) throw ToolError.notFound(`Tag "${params.tag}" not found`);
    const wikiItem = wikiData.items?.[0];
    return { tag: mapTagInfo(tagItem, wikiItem) };
  },
});
