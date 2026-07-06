import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawUserSummary, mapUserSummary, userSummarySchema } from './schemas.js';

interface SuggestionsResponse {
  groups?: { items?: { user?: RawUserSummary; social_context?: string }[] }[];
}

const suggestionSchema = z.object({
  user: userSummarySchema.describe('Suggested user'),
  social_context: z.string().describe('Why this user is suggested (e.g., "Followed by user1 + 3 others")'),
});

export const getSuggestedUsers = defineTool({
  name: 'get_suggested_users',
  displayName: 'Get Suggested Users',
  description:
    'Get personalized follow suggestions based on your network. Returns suggested users with social context explaining why they are recommended.',
  summary: 'Get follow suggestions',
  icon: 'user-plus',
  group: 'Social',
  input: z.object({}),
  output: z.object({
    suggestions: z.array(suggestionSchema).describe('Suggested users'),
  }),
  handle: async () => {
    const data = await api<SuggestionsResponse>('/discover/ayml/', {
      method: 'POST',
      body: 'phone_id=&module=discover_people',
      formEncoded: true,
    });
    const items = data.groups?.[0]?.items ?? [];
    return {
      suggestions: items.map(i => ({
        user: mapUserSummary(i.user ?? {}),
        social_context: i.social_context ?? '',
      })),
    };
  },
});
