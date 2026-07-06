import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { listSchema, mapList } from './schemas.js';
import type { RawListResult } from './schemas.js';

export const getList = defineTool({
  name: 'get_list',
  displayName: 'Get List',
  description: 'Get details about a list by its ID.',
  summary: 'Get list details',
  icon: 'list',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID'),
  }),
  output: z.object({
    list: listSchema,
  }),
  handle: async params => {
    const data = await graphqlQuery<{ data: { list: RawListResult } }>('ListByRestId', {
      listId: params.list_id,
    });

    return { list: mapList(data.data.list) };
  },
});
