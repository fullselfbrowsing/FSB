import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const addFilteredTag = defineTool({
  name: 'add_filtered_tag',
  displayName: 'Add Filtered Tag',
  description: 'Add a tag to the filter list. Posts with this tag will be hidden from your dashboard.',
  summary: 'Filter a tag from your dashboard',
  icon: 'filter-x',
  group: 'Account',
  input: z.object({
    tag: z.string().describe('Tag to filter (without # prefix)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api('/user/filtered_tags', {
      method: 'POST',
      body: { filtered_tags: [params.tag] },
    });
    return { success: true };
  },
});
