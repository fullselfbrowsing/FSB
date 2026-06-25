import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const listExpiredSubscribers = defineTool({
  name: 'list_expired_subscribers',
  displayName: 'List Expired Subscribers',
  description:
    'List recently expired subscribers. Only available for creator accounts. Useful for re-engagement campaigns.',
  summary: 'List recently expired subscribers',
  icon: 'user-minus',
  group: 'Subscriptions',
  input: z.object({}),
  output: z.object({
    users: z.array(userSchema).describe('Recently expired subscriber profiles'),
  }),
  handle: async () => {
    const data = await api<RawUser[]>('/subscriptions/subscribers/recent-expired', {
      query: { skip_users: 'all' },
    });
    return { users: (data ?? []).map(mapUser) };
  },
});
