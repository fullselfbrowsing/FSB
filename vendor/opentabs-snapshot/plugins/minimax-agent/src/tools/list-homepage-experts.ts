import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { expertSchema, mapExpert } from './schemas.js';
import type { RawExpert } from './schemas.js';

export const listHomepageExperts = defineTool({
  name: 'list_homepage_experts',
  displayName: 'List Homepage Experts',
  description: 'List featured AI experts/agents shown on the homepage. Returns paginated results.',
  summary: 'List homepage experts',
  icon: 'sparkles',
  group: 'Experts',
  input: z.object({
    page_num: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(50).optional().describe('Results per page (default 20)'),
  }),
  output: z.object({
    items: z.array(expertSchema).describe('List of homepage experts'),
    has_more: z.boolean().describe('Whether more results are available'),
    next_token: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await apiPost<{ expert_items?: RawExpert[]; has_more?: boolean; next_token?: string }>(
      '/matrix/api/v1/expert/list_for_homepage',
      { page_num: params.page_num ?? 1, page_size: params.page_size ?? 20 },
    );
    return {
      items: (data.expert_items ?? []).map(mapExpert),
      has_more: data.has_more ?? false,
      next_token: data.next_token ?? '',
    };
  },
});
