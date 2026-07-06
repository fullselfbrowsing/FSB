import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawGroup, groupSchema, mapGroup } from './schemas.js';

export const listGroups = defineTool({
  name: 'list_groups',
  displayName: 'List Groups',
  description: 'List all agent groups in the Zendesk account.',
  summary: 'List groups',
  icon: 'layers',
  group: 'Groups',
  input: z.object({}),
  output: z.object({
    groups: z.array(groupSchema).describe('List of groups'),
    count: z.number().int().describe('Total number of groups'),
  }),
  handle: async () => {
    const data = await api<{ groups: RawGroup[]; count: number }>('/groups.json');
    return {
      groups: (data.groups ?? []).map(mapGroup),
      count: data.count ?? 0,
    };
  },
});
