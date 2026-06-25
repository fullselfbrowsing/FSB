import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawView, mapView, viewSchema } from './schemas.js';

export const listViews = defineTool({
  name: 'list_views',
  displayName: 'List Views',
  description: 'List all shared and personal views in the Zendesk account.',
  summary: 'List views',
  icon: 'layout-list',
  group: 'Views',
  input: z.object({}),
  output: z.object({
    views: z.array(viewSchema).describe('List of views'),
    count: z.number().int().describe('Total number of views'),
  }),
  handle: async () => {
    const data = await api<{ views: RawView[]; count: number }>('/views.json');
    return {
      views: (data.views ?? []).map(mapView),
      count: data.count ?? 0,
    };
  },
});
