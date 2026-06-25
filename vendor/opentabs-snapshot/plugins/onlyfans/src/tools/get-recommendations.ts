import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getRecommendations = defineTool({
  name: 'get_recommendations',
  displayName: 'Get Recommendations',
  description:
    'Get recommended creators to follow. Returns a list of suggested users based on your interests and activity.',
  summary: 'Get recommended creators',
  icon: 'sparkles',
  group: 'Users',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of recommendations to return (default 10, max 50)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Recommended creators'),
  }),
  handle: async params => {
    const data = await api<RawUser[]>('/users/recommends', {
      query: { limit: params.limit ?? 10, offset: params.offset },
    });
    return { users: (data ?? []).map(mapUser) };
  },
});
