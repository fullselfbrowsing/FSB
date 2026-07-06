import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const getFile = defineTool({
  name: 'get_file',
  displayName: 'Get File',
  description:
    'Get detailed information about a specific file or folder by its ID. Returns metadata including name, MIME type, size, owner, sharing status, and a web view link.',
  summary: 'Get file or folder details by ID',
  icon: 'file',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File or folder ID'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const data = await api<RawFile>(`/files/${encodeURIComponent(params.file_id)}`, {
      params: { fields: FILE_FIELDS },
    });
    return { file: mapFile(data) };
  },
});
