import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { revisionSchema, mapRevision } from './schemas.js';
import type { RawRevision } from './schemas.js';

interface RevisionsResponse {
  query?: {
    pages?: Array<{
      pageid?: number;
      title?: string;
      revisions?: RawRevision[];
      missing?: boolean;
    }>;
  };
}

export const getRevisions = defineTool({
  name: 'get_revisions',
  displayName: 'Get Revisions',
  description:
    'Get the edit history (revisions) of a Wikipedia article. Returns revision IDs, editors, timestamps, edit summaries, and page sizes. Ordered from newest to oldest.',
  summary: 'Get revision history of an article',
  icon: 'history',
  group: 'Revisions',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of revisions to return (default 10, max 50)'),
  }),
  output: z.object({
    revisions: z.array(revisionSchema),
  }),
  handle: async params => {
    const data = await api<RevisionsResponse>({
      action: 'query',
      titles: params.title,
      prop: 'revisions',
      rvlimit: params.limit ?? 10,
      rvprop: 'ids|timestamp|user|comment|size',
    });

    const pages = data.query?.pages ?? [];
    const page = pages[0];
    if (!page || page.missing) {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return {
      revisions: (page.revisions ?? []).map(mapRevision),
    };
  },
});
