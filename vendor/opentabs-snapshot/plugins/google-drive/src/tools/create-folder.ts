import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawFile, FILE_FIELDS, fileSchema, mapFile } from './schemas.js';

export const createFolder = defineTool({
  name: 'create_folder',
  displayName: 'Create Folder',
  description:
    'Create a new folder in Google Drive. Specify parent_id to create a nested folder, otherwise it goes to My Drive root.',
  summary: 'Create a new folder',
  icon: 'folder-plus',
  group: 'Files',
  input: z.object({
    name: z.string().describe('Folder name'),
    parent_id: z.string().optional().describe('Parent folder ID. Defaults to My Drive root.'),
    description: z.string().optional().describe('Folder description'),
  }),
  output: z.object({
    file: fileSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      mimeType: 'application/vnd.google-apps.folder',
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
