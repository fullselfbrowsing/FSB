import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const copyFile = defineTool({
  name: 'copy_file',
  displayName: 'Copy File',
  description:
    'Create a copy of a file. Optionally specify a new name and parent folder for the copy. Folders cannot be copied.',
  summary: 'Create a copy of a file',
  icon: 'copy',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File ID to copy'),
    name: z.string().optional().describe('Name for the copy. Defaults to "Copy of <original name>".'),
    parent_id: z
      .string()
      .optional()
      .describe('Parent folder ID for the copy. Defaults to the same folder as the original.'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    if (params.parent_id) body.parents = [params.parent_id];

    const data = await api<RawFile>(`/files/${encodeURIComponent(params.file_id)}/copy`, {
      method: 'POST',
      params: { fields: FILE_FIELDS },
      body,
    });
    return { file: mapFile(data) };
  },
});
