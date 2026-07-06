import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const createFile = defineTool({
  name: 'create_file',
  displayName: 'Create File',
  description:
    'Create a new empty file in Google Drive. For Google Workspace types, use: "application/vnd.google-apps.document" (Docs), "application/vnd.google-apps.spreadsheet" (Sheets), "application/vnd.google-apps.presentation" (Slides). For regular files, use standard MIME types like "text/plain". Specify parent_id to create inside a folder, otherwise it goes to My Drive root.',
  summary: 'Create a new file in Google Drive',
  icon: 'file-plus',
  group: 'Files',
  input: z.object({
    name: z.string().describe('File name'),
    mime_type: z
      .string()
      .optional()
      .describe(
        'MIME type. Defaults to "application/vnd.google-apps.document" (Google Doc). Use "application/vnd.google-apps.spreadsheet" for Sheets, "application/vnd.google-apps.presentation" for Slides, "text/plain" for text files.',
      ),
    parent_id: z.string().optional().describe('Parent folder ID. Defaults to My Drive root.'),
    description: z.string().optional().describe('File description'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      mimeType: params.mime_type ?? 'application/vnd.google-apps.document',
    };
    if (params.parent_id) body.parents = [params.parent_id];
    if (params.description) body.description = params.description;

    const data = await api<RawFile>('/files', {
      method: 'POST',
      params: { fields: FILE_FIELDS },
      body,
    });
    return { file: mapFile(data) };
  },
});
