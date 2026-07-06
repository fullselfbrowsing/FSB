import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawEpic, epicSchema, mapEpic } from './schemas.js';

export const searchEpics = defineTool({
  name: 'search_epics',
  displayName: 'Search Epics',
  description: 'Search for epics by text query. Returns matching epics with pagination.',
  summary: 'Search epics by text',
  icon: 'search',
  group: 'Epics',
  input: z.object({
    query: z.string().describe('Search query text'),
    page_size: z.number().int().min(1).max(25).optional().describe('Results per page (default 25)'),
    next: z.string().optional().describe('Cursor token for next page'),
  }),
  output: z.object({
    epics: z.array(epicSchema).describe('Matching epics'),
    total: z.number().int().describe('Total number of results'),
    next: z.string().describe('Cursor for next page, or empty'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      query: params.query,
      page_size: params.page_size,
      next: params.next,
    };
    const data = await api<{ data?: RawEpic[]; total?: number; next?: string | null }>('/search/epics', { query });
    return {
      epics: (data.data ?? []).map(mapEpic),
      total: data.total ?? 0,
      next: data.next ?? '',
    };
  },
});
