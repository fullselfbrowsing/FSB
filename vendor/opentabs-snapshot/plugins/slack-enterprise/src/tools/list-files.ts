import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { fileSchema, mapFile } from './schemas.js';

export const listFiles = defineTool({
  name: 'list_files',
  displayName: 'List Files',
  description:
    'List files in the Slack workspace with optional filters for channel, user, and file type. Returns file metadata including download URLs.',
  summary: 'List workspace files',
  icon: 'file',
  group: 'Files',
  input: z.object({
    channel: z.string().optional().describe('Channel ID to filter files by — omit to search the entire workspace'),
    user: z.string().optional().describe('Filter files by the user who uploaded them (user ID)'),
    types: z
      .string()
      .optional()
      .describe('Filter by file type: all, spaces, snippets, images, gdocs, zips, pdfs (default all)'),
    count: z.number().optional().default(20).describe('Number of files to return (default 20, max 100)'),
    page: z.number().optional().default(1).describe('Page number for pagination (default 1)'),
  }),
  output: z.object({
    files: z.array(fileSchema),
    total: z.number(),
    page: z.number(),
    pages: z.number(),
  }),
  handle: async params => {
    const apiParams: Record<string, unknown> = {
      count: Math.min(params.count ?? 20, 100),
      page: params.page ?? 1,
    };
    if (params.channel) apiParams.channel = params.channel;
    if (params.user) apiParams.user = params.user;
    if (params.types) apiParams.types = params.types;

    const data = await slackApi<{
      files: Array<Record<string, unknown>>;
      paging: { total: number; page: number; pages: number };
    }>('files.list', apiParams);

    return {
      files: (data.files ?? []).map(mapFile),
      total: data.paging?.total ?? 0,
      page: data.paging?.page ?? 1,
      pages: data.paging?.pages ?? 1,
    };
  },
});
