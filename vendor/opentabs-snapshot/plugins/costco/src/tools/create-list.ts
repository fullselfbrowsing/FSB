import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createList } from '../costco-api.js';
import { listSchema, mapList } from './schemas.js';

export const createListTool = defineTool({
  name: 'create_list',
  displayName: 'Create List',
  description: 'Create a new shopping list (wishlist) on the Costco account.',
  summary: 'Create a new shopping list',
  icon: 'list-plus',
  group: 'Lists',
  input: z.object({
    title: z.string().describe('Title for the new list'),
    description: z.string().optional().describe('Description for the list'),
  }),
  output: z.object({ list: listSchema }),
  handle: async params => {
    const data = await createList(params.title, params.description ?? '');
    return { list: mapList(data) };
  },
});
