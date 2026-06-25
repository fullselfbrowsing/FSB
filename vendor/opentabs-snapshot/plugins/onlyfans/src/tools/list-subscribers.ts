import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

interface SubscribersResponse {
  list?: RawUser[];
  hasMore?: boolean;
}

export const listSubscribers = defineTool({
  name: 'list_subscribers',
  displayName: 'List Subscribers',
  description: 'List your subscribers (people subscribed to you). Only available for creator accounts.',
  summary: 'List your subscribers',
  icon: 'users',
  group: 'Subscriptions',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Number of subscribers to return (default 10)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    subscribers: z.array(userSchema).describe('Subscriber profiles'),
    has_more: z.boolean().describe('Whether more subscribers are available'),
  }),
  handle: async params => {
    const data = await api<SubscribersResponse>('/subscriptions/subscribers', {
      query: {
        limit: params.limit ?? 10,
        offset: params.offset ?? 0,
        skip_users: 'all',
      },
    });
    return {
      subscribers: (data.list ?? []).map(mapUser),
      has_more: data.hasMore ?? false,
    };
  },
});
