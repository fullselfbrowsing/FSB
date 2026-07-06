import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawVersion, mapVersion, versionSchema } from './schemas.js';

export const listVersions = defineTool({
  name: 'list_versions',
  displayName: 'List Versions',
  description: 'List version history of a file.',
  summary: 'List file version history',
  icon: 'history',
  group: 'Versions',
  input: z.object({
    item_id: z.string().describe('File ID'),
  }),
  output: z.object({
    versions: z.array(versionSchema).describe('Version history entries'),
  }),
  handle: async ({ item_id }) => {
    const data = await api<{ value: RawVersion[] }>(`/me/drive/items/${item_id}/versions`);
    return { versions: data.value.map(mapVersion) };
  },
});
