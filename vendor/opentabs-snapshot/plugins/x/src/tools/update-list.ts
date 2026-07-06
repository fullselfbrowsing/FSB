import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';
import { listSchema, mapList } from './schemas.js';
import type { RawListResult } from './schemas.js';

export const updateList = defineTool({
  name: 'update_list',
  displayName: 'Update List',
  description: "Update a list's name, description, or privacy setting.",
  summary: 'Update list details',
  icon: 'edit',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID'),
    name: z.string().min(1).max(25).optional().describe('New name'),
    description: z.string().max(100).optional().describe('New description'),
    is_private: z.boolean().optional().describe('New privacy setting'),
  }),
  output: z.object({
    list: listSchema,
  }),
  handle: async params => {
    const data = await graphqlMutation<{ data: { list_update: { list: RawListResult } } }>('UpdateList', {
      listId: params.list_id,
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.is_private !== undefined ? { isPrivate: params.is_private } : {}),
    });

    return { list: mapList(data.data.list_update.list) };
  },
});
