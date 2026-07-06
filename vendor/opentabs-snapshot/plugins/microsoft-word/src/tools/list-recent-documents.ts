import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const listRecentDocuments = defineTool({
  name: 'list_recent_documents',
  displayName: 'List Recent Documents',
  description: 'List recently accessed documents from OneDrive.',
  summary: 'List recent documents',
  icon: 'clock',
  group: 'Files',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10, max 50)'),
  }),
  output: z.object({
    items: z.array(driveItemSchema).describe('Recently accessed items'),
  }),
  handle: async params => {
    const data = await api<{ value: RawDriveItem[] }>('/me/drive/recent', {
      query: {
        $top: params.limit ?? 10,
      },
    });
    return { items: (data.value ?? []).map(mapDriveItem) };
  },
});
