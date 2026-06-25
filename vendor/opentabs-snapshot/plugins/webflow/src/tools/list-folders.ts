import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { folderSchema, mapFolder } from './schemas.js';
import type { RawFolder } from './schemas.js';

interface FoldersResponse {
  folders?: RawFolder[];
}

export const listFolders = defineTool({
  name: 'list_folders',
  displayName: 'List Folders',
  description: 'List all folders in a Webflow workspace. Folders are used to organize sites into groups.',
  summary: 'List workspace folders',
  icon: 'folder',
  group: 'Workspaces',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug'),
  }),
  output: z.object({
    folders: z.array(folderSchema),
  }),
  handle: async params => {
    const data = await api<FoldersResponse>(`/workspaces/${params.workspace_slug}/folders`);
    return {
      folders: (data.folders ?? []).map(mapFolder),
    };
  },
});
