import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';

const tagEntrySchema = z.object({
  name: z.string().describe('Tag name'),
  count: z.number().int().describe('Number of times the tag has been applied'),
});

export const listTags = defineTool({
  name: 'list_tags',
  displayName: 'List Tags',
  description: 'List all tags in the Zendesk account with their usage counts.',
  summary: 'List tags',
  icon: 'tag',
  group: 'Tags',
  input: z.object({}),
  output: z.object({
    tags: z.array(tagEntrySchema).describe('List of tags with usage counts'),
  }),
  handle: async () => {
    const data = await api<{ tags: { name?: string; count?: number }[] }>('/tags.json');
    return {
      tags: (data.tags ?? []).map(t => ({
        name: t.name ?? '',
        count: t.count ?? 0,
      })),
    };
  },
});
