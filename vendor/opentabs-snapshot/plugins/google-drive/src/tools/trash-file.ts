import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const trashFile = defineTool({
  name: 'trash_file',
  displayName: 'Trash File',
  description:
    'Move a file or folder to the trash. Trashed files can be restored with restore_file or permanently deleted with empty_trash. Files in the trash are automatically deleted after 30 days.',
  summary: 'Move a file to the trash',
  icon: 'trash',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File or folder ID to trash'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const data = await api<RawFile>(`/files/${encodeURIComponent(params.file_id)}`, {
      method: 'PATCH',
      params: { fields: FILE_FIELDS },
      body: { trashed: true },
    });
    return { file: mapFile(data) };
  },
});
