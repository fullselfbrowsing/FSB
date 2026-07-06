import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUserList, mapUserList, userListSchema } from './schemas.js';

export const listUserLists = defineTool({
  name: 'list_user_lists',
  displayName: 'List User Lists',
  description:
    'Get all user-created lists (e.g. Fans, Following, custom lists). Lists organize subscribed users into groups.',
  summary: 'Get your user lists',
  icon: 'list',
  group: 'Lists',
  input: z.object({}),
  output: z.object({
    lists: z.array(userListSchema).describe('User lists'),
  }),
  handle: async () => {
    const data = await api<RawUserList[]>('/lists');
    return { lists: (data ?? []).map(mapUserList) };
  },
});
