import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getUserBadges = defineTool({
  name: 'get_user_badges',
  displayName: 'Get User Badges',
  description: 'Get badges earned by a user. Returns badge name, icon URL, and creation date.',
  summary: 'Get a user earned badges',
  icon: 'award',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({
    badgeCount: z.number().describe('Total number of badges'),
    badges: z.array(
      z.object({
        id: z.string().describe('Badge ID'),
        name: z.string().describe('Badge display name'),
        icon: z.string().describe('Badge icon URL'),
        creationDate: z.string().describe('Date the badge was earned'),
      }),
    ),
    upcomingBadges: z.array(
      z.object({
        name: z.string().describe('Badge name'),
        icon: z.string().describe('Badge icon URL'),
      }),
    ),
  }),
  handle: async params => {
    const data = await graphql<{
      matchedUser: {
        badges?: Array<{
          id?: string;
          displayName?: string;
          icon?: string;
          creationDate?: string;
        }>;
        upcomingBadges?: Array<{
          name?: string;
          icon?: string;
        }>;
      };
    }>(
      `query userBadges($username: String!) {
				matchedUser(username: $username) {
					badges { id displayName icon creationDate }
					upcomingBadges { name icon }
				}
			}`,
      { username: params.username },
    );

    const badges = (data.matchedUser?.badges ?? []).map(b => ({
      id: b.id ?? '',
      name: b.displayName ?? '',
      icon: b.icon ?? '',
      creationDate: b.creationDate ?? '',
    }));

    const upcomingBadges = (data.matchedUser?.upcomingBadges ?? []).map(b => ({
      name: b.name ?? '',
      icon: b.icon ?? '',
    }));

    return {
      badgeCount: badges.length,
      badges,
      upcomingBadges,
    };
  },
});
