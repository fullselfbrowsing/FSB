import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const moveFile = defineTool({
  name: 'move_file',
  displayName: 'Move File',
  description:
    'Move a file or folder to a different parent folder. Specify the current parent to remove and the new parent to add. Use "root" for My Drive root.',
  summary: 'Move a file to a different folder',
  icon: 'folder-input',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File or folder ID to move'),
    from_parent_id: z.string().describe('Current parent folder ID to remove. Use "root" for My Drive root.'),
    to_parent_id: z.string().describe('New parent folder ID. Use "root" for My Drive root.'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const data = await api<RawFile>(`/files/${encodeURIComponent(params.file_id)}`, {
      method: 'PATCH',
      params: {
        addParents: params.to_parent_id,
        removeParents: params.from_parent_id,
        fields: FILE_FIELDS,
      },
    });
    return { file: mapFile(data) };
  },
});
