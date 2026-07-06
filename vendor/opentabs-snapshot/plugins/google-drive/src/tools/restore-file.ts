import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const restoreFile = defineTool({
  name: 'restore_file',
  displayName: 'Restore File',
  description: 'Restore a file or folder from the trash back to its original location.',
  summary: 'Restore a file from the trash',
  icon: 'undo-2',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File or folder ID to restore from trash'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const data = await api<RawFile>(`/files/${encodeURIComponent(params.file_id)}`, {
      method: 'PATCH',
      params: { fields: FILE_FIELDS },
      body: { trashed: false },
    });
    return { file: mapFile(data) };
  },
});
