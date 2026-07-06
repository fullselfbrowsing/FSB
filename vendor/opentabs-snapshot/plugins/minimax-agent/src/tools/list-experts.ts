import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { expertSchema, mapExpert } from './schemas.js';
import type { RawExpert } from './schemas.js';

export const listExperts = defineTool({
  name: 'list_experts',
  displayName: 'List Experts',
  description: 'List your AI experts/agents. Returns paginated results.',
  summary: 'List your AI experts',
  icon: 'bot',
  group: 'Experts',
  input: z.object({
    page_num: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(50).optional().describe('Results per page (default 20)'),
  }),
  output: z.object({
    items: z.array(expertSchema).describe('List of experts'),
    has_more: z.boolean().describe('Whether more results are available'),
    next_token: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await apiPost<{ expert_items?: RawExpert[]; has_more?: boolean; next_token?: string }>(
      '/matrix/api/v1/expert/list',
      { page_num: params.page_num ?? 1, page_size: params.page_size ?? 20 },
    );
    return {
      items: (data.expert_items ?? []).map(mapExpert),
      has_more: data.has_more ?? false,
      next_token: data.next_token ?? '',
    };
  },
});
