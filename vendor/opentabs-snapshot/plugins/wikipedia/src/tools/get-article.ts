import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { pageSummarySchema, mapPageSummary } from './schemas.js';
import type { RawPage } from './schemas.js';

interface PageResponse {
  query?: {
    pages?: RawPage[];
  };
}

export const getArticle = defineTool({
  name: 'get_article',
  displayName: 'Get Article',
  description:
    'Get a Wikipedia article summary including the introduction extract, description, thumbnail, protection status, and URL. Use get_article_sections for the full table of contents, or get_section_content to read a specific section.',
  summary: 'Get article summary and metadata',
  icon: 'book-open',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript", "Albert Einstein")'),
  }),
  output: z.object({
    article: pageSummarySchema,
  }),
  handle: async params => {
    const data = await api<PageResponse>({
      action: 'query',
      titles: params.title,
      prop: 'extracts|info|pageprops|pageimages',
      exintro: 1,
      explaintext: 1,
      piprop: 'thumbnail',
      pithumbsize: 300,
      inprop: 'url|displaytitle|protection',
    });

    const pages = data.query?.pages ?? [];
    const page = pages[0];
    if (!page || page.pageid === undefined || (page as Record<string, unknown>).missing !== undefined) {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return { article: mapPageSummary(page) };
  },
});
