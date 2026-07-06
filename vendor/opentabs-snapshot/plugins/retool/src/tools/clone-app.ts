import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const cloneApp = defineTool({
  name: 'clone_app',
  displayName: 'Clone App',
  description:
    'Clone an existing Retool app (page) to create a copy with a new name. The clone is placed in the specified folder.',
  summary: 'Clone an existing app',
  icon: 'copy',
  group: 'Apps',
  input: z.object({
    page_uuid: z.string().describe('UUID of the page to clone (use list_apps to find UUIDs)'),
    new_name: z.string().describe('Name for the cloned app'),
    folder_id: z.number().describe('Folder ID to place the clone in'),
  }),
  output: z.object({
    new_page_uuid: z.string().describe('UUID of the cloned page'),
    new_page_name: z.string().describe('Name of the cloned page'),
  }),
  handle: async params => {
    const data = await api<{
      newPageName: string;
      pageUuid: string;
    }>('/api/pages/clonePage', {
      method: 'POST',
      body: {
        pageUuid: params.page_uuid,
        newPageName: params.new_name,
        folderId: params.folder_id,
      },
    });
    return {
      new_page_uuid: data.pageUuid ?? '',
      new_page_name: data.newPageName ?? '',
    };
  },
});
