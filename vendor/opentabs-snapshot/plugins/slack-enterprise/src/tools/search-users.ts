import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapUser, userSchema } from './schemas.js';

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description:
    'Search for users in the Slack workspace by name or email. Fetches the user list and filters client-side since the Slack Web API does not provide a dedicated user search endpoint.',
  summary: 'Search users by name or email',
  icon: 'user-search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query (name or email)'),
  }),
  output: z.object({
    users: z.array(userSchema),
  }),
  handle: async params => {
    const query = params.query.toLowerCase();
    const allUsers: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;

    // Paginate through users.list to find matches
    for (let page = 0; page < 10; page++) {
      const apiParams: Record<string, unknown> = { limit: 200 };
      if (cursor) apiParams.cursor = cursor;

      const data = await slackApi<{
        members: Array<Record<string, unknown>>;
        response_metadata?: { next_cursor?: string };
      }>('users.list', apiParams);

      for (const member of data.members ?? []) {
        const name = (member.name as string | undefined)?.toLowerCase() ?? '';
        const realName = (member.real_name as string | undefined)?.toLowerCase() ?? '';
        const displayName =
          (
            (member.profile as Record<string, unknown> | undefined)?.display_name as string | undefined
          )?.toLowerCase() ?? '';
        const email =
          ((member.profile as Record<string, unknown> | undefined)?.email as string | undefined)?.toLowerCase() ?? '';

        if (name.includes(query) || realName.includes(query) || displayName.includes(query) || email.includes(query)) {
          allUsers.push(member);
        }
      }

      cursor = data.response_metadata?.next_cursor ?? undefined;
      if (!cursor) break;

      // Stop early if we have enough matches
      if (allUsers.length >= 50) break;
    }

    return { users: allUsers.slice(0, 50).map(mapUser) };
  },
});
