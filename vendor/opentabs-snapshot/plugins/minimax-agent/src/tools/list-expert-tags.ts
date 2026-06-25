import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { expertTagSchema, mapExpertTag } from './schemas.js';
import type { RawExpertTag } from './schemas.js';

export const listExpertTags = defineTool({
  name: 'list_expert_tags',
  displayName: 'List Expert Tags',
  description: 'List all available tags for categorizing AI experts/agents.',
  summary: 'List expert tags',
  icon: 'tags',
  group: 'Experts',
  input: z.object({}),
  output: z.object({
    tags: z.array(expertTagSchema).describe('List of expert tags'),
  }),
  handle: async () => {
    const data = await apiPost<{ tags?: RawExpertTag[] }>('/matrix/api/v1/expert/list_tags', {});
    return {
      tags: (data.tags ?? []).map(mapExpertTag),
    };
  },
});
