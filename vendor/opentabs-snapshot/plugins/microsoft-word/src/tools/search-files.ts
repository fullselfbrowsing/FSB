import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const searchFiles = defineTool({
  name: 'search_files',
  displayName: 'Search Files',
  description: 'Search for files and folders by name in OneDrive.',
  summary: 'Search files and folders',
  icon: 'search',
  group: 'Files',
  input: z.object({
    query: z.string().min(1).describe('Search query text'),
    top: z.number().int().min(1).max(50).optional().describe('Max results (default 10, max 50)'),
  }),
  output: z.object({
    items: z.array(driveItemSchema).describe('Matching files and folders'),
  }),
  handle: async params => {
    const q = params.query.replace(/'/g, "''");
    const data = await api<{ value: RawDriveItem[] }>(`/me/drive/root/search(q='${q}')`, {
      query: {
        $top: params.top ?? 10,
      },
    });
    return { items: (data.value ?? []).map(mapDriveItem) };
  },
});
