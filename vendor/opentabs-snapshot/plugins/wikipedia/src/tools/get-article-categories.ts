import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { categorySchema, mapCategory } from './schemas.js';
import type { RawCategory } from './schemas.js';

interface CategoriesResponse {
  query?: {
    pages?: Array<{
      pageid?: number;
      title?: string;
      categories?: RawCategory[];
      missing?: boolean;
    }>;
  };
}

export const getArticleCategories = defineTool({
  name: 'get_article_categories',
  displayName: 'Get Article Categories',
  description:
    'Get the categories that a Wikipedia article belongs to. Returns category titles. Supports pagination via continue token.',
  summary: 'List categories an article belongs to',
  icon: 'tags',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of categories to return (default 50, max 500)'),
  }),
  output: z.object({
    categories: z.array(categorySchema),
  }),
  handle: async params => {
    const data = await api<CategoriesResponse>({
      action: 'query',
      titles: params.title,
      prop: 'categories',
      cllimit: params.limit ?? 50,
    });

    const pages = data.query?.pages ?? [];
    const page = pages[0];
    if (!page || page.missing) {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return {
      categories: (page.categories ?? []).map(mapCategory),
    };
  },
});
