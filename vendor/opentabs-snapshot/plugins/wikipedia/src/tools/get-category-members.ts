import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';

interface CategoryMembersResponse {
  query?: {
    categorymembers?: Array<{
      pageid?: number;
      title?: string;
      ns?: number;
    }>;
  };
}

export const getCategoryMembers = defineTool({
  name: 'get_category_members',
  displayName: 'Get Category Members',
  description:
    'Get the pages that belong to a specific Wikipedia category. Returns article titles. The category name should include the "Category:" prefix (e.g., "Category:Programming languages").',
  summary: 'List pages in a category',
  icon: 'folder-open',
  group: 'Categories',
  input: z.object({
    category: z.string().describe('Category name with prefix (e.g., "Category:Programming languages")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of pages to return (default 50, max 500)'),
    type: z
      .enum(['page', 'subcat', 'file'])
      .optional()
      .describe('Type of category members to return (default: "page"). "subcat" for subcategories, "file" for files'),
  }),
  output: z.object({
    members: z.array(
      z.object({
        pageid: z.number().int().describe('Page ID'),
        title: z.string().describe('Page title'),
      }),
    ),
  }),
  handle: async params => {
    const data = await api<CategoryMembersResponse>({
      action: 'query',
      list: 'categorymembers',
      cmtitle: params.category,
      cmlimit: params.limit ?? 50,
      cmtype: params.type ?? 'page',
    });

    const members = (data.query?.categorymembers ?? []).map(m => ({
      pageid: m.pageid ?? 0,
      title: m.title ?? '',
    }));

    return { members };
  },
});
