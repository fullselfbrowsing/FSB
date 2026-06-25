import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';

interface BacklinksResponse {
  query?: {
    backlinks?: Array<{
      pageid?: number;
      title?: string;
    }>;
  };
}

export const getBacklinks = defineTool({
  name: 'get_backlinks',
  displayName: 'Get Backlinks',
  description:
    'Get the pages that link to a specific Wikipedia article (also known as "What links here"). Useful for understanding how widely referenced an article is.',
  summary: 'Find pages that link to an article',
  icon: 'corner-down-left',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of backlinks to return (default 50, max 500)'),
  }),
  output: z.object({
    backlinks: z.array(
      z.object({
        pageid: z.number().int().describe('Page ID'),
        title: z.string().describe('Page title'),
      }),
    ),
  }),
  handle: async params => {
    const data = await api<BacklinksResponse>({
      action: 'query',
      list: 'backlinks',
      bltitle: params.title,
      bllimit: params.limit ?? 50,
      blnamespace: 0,
    });

    const backlinks = (data.query?.backlinks ?? []).map(bl => ({
      pageid: bl.pageid ?? 0,
      title: bl.title ?? '',
    }));

    return { backlinks };
  },
});
