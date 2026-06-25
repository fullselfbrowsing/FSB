import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const createApp = defineTool({
  name: 'create_app',
  displayName: 'Create App',
  description:
    'Create a new Retool web app (page). The app is created in the specified folder. Returns the initial save record.',
  summary: 'Create a new Retool web app',
  icon: 'plus',
  group: 'Apps',
  input: z.object({
    name: z.string().describe('Name for the new app'),
    folder_id: z.number().describe('Folder ID to create the app in (use list_apps to find folder IDs)'),
    is_mobile_app: z.boolean().optional().describe('Whether to create a mobile app (default false)'),
    is_global_widget: z.boolean().optional().describe('Whether to create a module/global widget (default false)'),
  }),
  output: z.object({
    page_uuid: z.string().describe('UUID of the created page'),
    save_id: z.number().describe('ID of the initial save record'),
  }),
  handle: async params => {
    const data = await api<{
      save: { id: number };
      page: { uuid?: string };
    }>('/api/pages/createPage', {
      method: 'POST',
      body: {
        pageName: params.name,
        folderId: params.folder_id,
        isMobileApp: params.is_mobile_app ?? false,
        isGlobalWidget: params.is_global_widget ?? false,
      },
    });
    return {
      page_uuid: data.page?.uuid ?? '',
      save_id: data.save?.id ?? 0,
    };
  },
});
