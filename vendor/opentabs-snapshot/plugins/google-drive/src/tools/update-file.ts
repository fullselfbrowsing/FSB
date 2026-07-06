import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const updateFile = defineTool({
  name: 'update_file',
  displayName: 'Update File',
  description:
    'Update file or folder metadata — rename, change description, or toggle starred status. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update file or folder metadata',
  icon: 'pencil',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File or folder ID'),
    name: z.string().optional().describe('New file name'),
    description: z.string().optional().describe('New description'),
    starred: z.boolean().optional().describe('Whether the file is starred'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.description !== undefined) body.description = params.description;
    if (params.starred !== undefined) body.starred = params.starred;

    const data = await api<RawFile>(`/files/${encodeURIComponent(params.file_id)}`, {
      method: 'PATCH',
      params: { fields: FILE_FIELDS },
      body,
    });
    return { file: mapFile(data) };
  },
});
