import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { gptSchema, mapGpt } from './schemas.js';

export const discoverGpts = defineTool({
  name: 'discover_gpts',
  displayName: 'Discover GPTs',
  description: 'Browse the ChatGPT GPT store to discover custom GPTs. Returns categorized lists of featured GPTs.',
  summary: 'Explore the GPT store',
  icon: 'store',
  group: 'GPTs',
  input: z.object({
    cursor: z.number().int().min(0).optional().describe('Pagination cursor (default 0)'),
    limit: z.number().int().min(1).max(50).optional().describe('Number of results per category (default 10)'),
    locale: z.string().optional().describe('Locale for results (default "en-US")'),
  }),
  output: z.object({
    categories: z
      .array(
        z.object({
          title: z.string().describe('Category title'),
          gpts: z.array(gptSchema).describe('GPTs in this category'),
        }),
      )
      .describe('GPT categories with their items'),
  }),
  handle: async params => {
    const data = await api<{
      cuts?: {
        info?: { title?: string };
        list?: { items?: { resource?: { gizmo?: Record<string, unknown> } }[] };
      }[];
    }>('/gizmos/discovery', {
      query: {
        cursor: params.cursor ?? 0,
        limit: params.limit ?? 10,
        locale: params.locale ?? 'en-US',
      },
    });
    const categories = (data.cuts ?? []).map(cut => ({
      title: cut.info?.title ?? '',
      gpts: (cut.list?.items ?? []).map(item => mapGpt((item.resource?.gizmo ?? {}) as Parameters<typeof mapGpt>[0])),
    }));
    return { categories };
  },
});
