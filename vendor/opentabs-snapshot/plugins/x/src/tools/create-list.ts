import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';
import { listSchema, mapList } from './schemas.js';
import type { RawListResult } from './schemas.js';

export const createList = defineTool({
  name: 'create_list',
  displayName: 'Create List',
  description: 'Create a new list.',
  summary: 'Create a new list',
  icon: 'list-plus',
  group: 'Lists',
  input: z.object({
    name: z.string().min(1).max(25).describe('List name (max 25 characters)'),
    description: z.string().max(100).optional().describe('List description (max 100 characters)'),
    is_private: z.boolean().optional().describe('Whether the list is private (default false)'),
  }),
  output: z.object({
    list: listSchema,
  }),
  handle: async params => {
    const data = await graphqlMutation<{ data: { list: { list: RawListResult } } }>('CreateList', {
      name: params.name,
      description: params.description ?? '',
      isPrivate: params.is_private ?? false,
    });

    return { list: mapList(data.data.list.list) };
  },
});
