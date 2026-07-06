import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const getFilteredTags = defineTool({
  name: 'get_filtered_tags',
  displayName: 'Get Filtered Tags',
  description:
    'Get the list of tags the authenticated user has filtered out of their dashboard. Posts with these tags are hidden.',
  summary: 'Get your filtered tags',
  icon: 'filter',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    tags: z.array(z.string()).describe('Filtered tag strings'),
  }),
  handle: async () => {
    const data = await api<{ filteredTags: string[] }>('/user/filtered_tags');
    return { tags: data.filteredTags ?? [] };
  },
});
