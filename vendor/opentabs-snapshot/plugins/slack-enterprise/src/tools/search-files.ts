import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { fileSchema, mapFile } from './schemas.js';

export const searchFiles = defineTool({
  name: 'search_files',
  displayName: 'Search Files',
  description: 'Search for files in Slack by name, type, or content. Returns file metadata including download URLs.',
  summary: 'Search files in Slack',
  icon: 'file-search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query string'),
    count: z.number().optional().default(20).describe('Number of results to return (default 20, max 100)'),
  }),
  output: z.object({
    files: z.array(fileSchema),
    total: z.number(),
  }),
  handle: async params => {
    const data = await slackApi<{
      files: {
        matches: Array<Record<string, unknown>>;
        total: number;
        paging: { total: number };
      };
    }>('search.files', {
      query: params.query,
      count: Math.min(params.count ?? 20, 100),
    });

    const matches = data.files?.matches ?? [];
    return {
      files: matches.map(mapFile),
      total: data.files?.paging?.total ?? data.files?.total ?? 0,
    };
  },
});
