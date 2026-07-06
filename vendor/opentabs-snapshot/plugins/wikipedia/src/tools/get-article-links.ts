import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';

interface LinksResponse {
  query?: {
    pages?: Array<{
      pageid?: number;
      title?: string;
      links?: Array<{ title?: string }>;
      missing?: boolean;
    }>;
  };
}

export const getArticleLinks = defineTool({
  name: 'get_article_links',
  displayName: 'Get Article Links',
  description:
    'Get the internal Wikipedia links from an article. Returns titles of all linked articles. Useful for exploring related topics.',
  summary: 'List internal links from an article',
  icon: 'link',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of links to return (default 50, max 500)'),
  }),
  output: z.object({
    links: z.array(z.string().describe('Linked article title')),
  }),
  handle: async params => {
    const data = await api<LinksResponse>({
      action: 'query',
      titles: params.title,
      prop: 'links',
      pllimit: params.limit ?? 50,
      plnamespace: 0,
    });

    const pages = data.query?.pages ?? [];
    const page = pages[0];
    if (!page || page.missing) {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return {
      links: (page.links ?? []).map(l => l.title ?? ''),
    };
  },
});
