import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';

export const getPreviewUrl = defineTool({
  name: 'get_preview_url',
  displayName: 'Get Preview URL',
  description: 'Get an embeddable preview URL for a document. Useful for generating view-only links.',
  summary: 'Get a document preview URL',
  icon: 'eye',
  group: 'Files',
  input: z.object({
    item_id: z.string().describe('File ID'),
  }),
  output: z.object({
    url: z.string().describe('Embeddable preview URL'),
  }),
  handle: async ({ item_id }) => {
    const data = await api<{ getUrl: string }>(`/me/drive/items/${item_id}/preview`, { method: 'POST', body: {} });
    return { url: data.getUrl };
  },
});
