import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_LIST_FIELDS, fileSchema, mapFile } from './schemas.js';

export const listFiles = defineTool({
  name: 'list_files',
  displayName: 'List Files',
  description:
    'List files and folders in Google Drive. By default lists items in the root "My Drive" folder. Use parent_id to list children of a specific folder. Supports ordering by name, modifiedTime, or createdTime. Trashed files are excluded by default.',
  summary: 'List files and folders in a Drive folder',
  icon: 'list',
  group: 'Files',
  input: z.object({
    parent_id: z.string().optional().describe('Parent folder ID to list contents of. Defaults to "root" (My Drive)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of files to return (default 50, max 1000)'),
    page_token: z.string().optional().describe('Page token from a previous response for pagination'),
    order_by: z
      .string()
      .optional()
      .describe('Sort order. Examples: "name", "modifiedTime desc", "createdTime desc". Default: "modifiedTime desc"'),
    include_trashed: z.boolean().optional().describe('Include trashed files in results (default false)'),
  }),
  output: z.object({
    files: z.array(fileSchema).describe('List of files and folders'),
    next_page_token: z.string().describe('Token for the next page, empty if no more results'),
  }),
  handle: async params => {
    const parentId = params.parent_id ?? 'root';
    const trashFilter = params.include_trashed ? '' : ' and trashed = false';
    const q = `'${parentId}' in parents${trashFilter}`;

    const data = await api<{ nextPageToken?: string; files?: RawFile[] }>('/files', {
      params: {
        q,
        pageSize: params.page_size ?? 50,
        pageToken: params.page_token,
        orderBy: params.order_by ?? 'modifiedTime desc',
        fields: FILE_LIST_FIELDS,
      },
    });

    return {
      files: (data.files ?? []).map(mapFile),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
