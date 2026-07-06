import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const removeFilteredTag = defineTool({
  name: 'remove_filtered_tag',
  displayName: 'Remove Filtered Tag',
  description: 'Remove a tag from the filter list. Posts with this tag will appear on your dashboard again.',
  summary: 'Unfilter a tag',
  icon: 'filter',
  group: 'Account',
  input: z.object({
    tag: z.string().describe('Tag to remove from filter list'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/user/filtered_tags/${encodeURIComponent(params.tag)}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
