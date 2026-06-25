import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { tagSchema, mapTag } from './schemas.js';

export const listTags = defineTool({
  name: 'list_tags',
  displayName: 'List Tags',
  description:
    'List Stack Overflow tags sorted by popularity or name. Tags categorize questions by topic. Use this to discover popular technologies and topics.',
  summary: 'List tags by popularity or name',
  icon: 'tag',
  group: 'Tags',
  input: z.object({
    inname: z.string().optional().describe('Filter tags containing this string (e.g., "java")'),
    sort: z.enum(['popular', 'activity', 'name']).optional().describe('Sort order (default: popular)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    tags: z.array(tagSchema).describe('Tags'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/tags', {
      query: {
        inname: params.inname,
        sort: params.sort ?? 'popular',
        order: params.order ?? 'desc',
        page: params.page,
        pagesize: params.pagesize,
      },
    });
    return {
      tags: (data.items ?? []).map(mapTag),
      has_more: data.has_more ?? false,
      quota_remaining: data.quota_remaining ?? 0,
    };
  },
});
