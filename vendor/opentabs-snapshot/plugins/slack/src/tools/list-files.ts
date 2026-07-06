import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface SlackFile {
  id: string;
  name: string;
  title?: string;
  filetype?: string;
  size?: number;
  user?: string;
  created?: number;
  permalink?: string;
}

interface SlackPaging {
  count: number;
  total: number;
  page: number;
  pages: number;
}

export const listFiles = defineTool({
  name: 'list_files',
  displayName: 'List Files',
  description: 'List files in a Slack channel or workspace with optional filters',
  summary: 'List files in a channel or workspace',
  icon: 'files',
  group: 'Files',
  input: z.object({
    channel: z.string().optional().describe('Channel ID to filter files by — omit to search the entire workspace'),
    count: z.number().int().min(1).max(100).optional().describe('Number of files to return (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    types: z
      .string()
      .optional()
      .describe('Filter by file type: all, spaces, snippets, images, gdocs, zips, pdfs (default all)'),
    user: z.string().optional().describe('Filter files by the user who uploaded them (user ID)'),
  }),
  output: z.object({
    files: z
      .array(
        z.object({
          id: z.string().describe('File ID'),
          name: z.string().describe('File name'),
          title: z.string().describe('File title'),
          filetype: z.string().describe('File type identifier (e.g., png, pdf, txt)'),
          size: z.number().describe('File size in bytes'),
          user: z.string().describe('User ID of the uploader'),
          created: z.number().describe('Unix timestamp of when the file was created'),
          permalink: z.string().describe('Permanent link to the file in Slack'),
        }),
      )
      .describe('Array of file objects'),
    paging: z
      .object({
        count: z.number().describe('Number of files per page'),
        total: z.number().describe('Total number of files matching the filter'),
        page: z.number().describe('Current page number'),
        pages: z.number().describe('Total number of pages'),
      })
      .optional()
      .describe('Pagination information'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      count: params.count ?? 20,
    };
    if (params.channel) body.channel = params.channel;
    if (params.page !== undefined) body.page = params.page;
    if (params.types) body.types = params.types;
    if (params.user) body.user = params.user;

    const data = await slackApi<{ files?: SlackFile[]; paging?: SlackPaging }>('files.list', body);
    return {
      files: (data.files ?? []).map(f => ({
        id: f.id,
        name: f.name,
        title: f.title ?? f.name,
        filetype: f.filetype ?? '',
        size: f.size ?? 0,
        user: f.user ?? '',
        created: f.created ?? 0,
        permalink: f.permalink ?? '',
      })),
      paging: data.paging
        ? {
            count: data.paging.count,
            total: data.paging.total,
            page: data.paging.page,
            pages: data.paging.pages,
          }
        : undefined,
    };
  },
});
