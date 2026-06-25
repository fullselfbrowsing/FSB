import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';

const groupSchema = z.object({
  id: z.string().describe('Group ID'),
  name: z.string().describe('Group name'),
  member_count: z.number().int().describe('Number of members'),
  url: z.string().describe('URL to the group page'),
  image_url: z.string().describe('Group cover photo URL'),
  privacy: z.string().describe('Group privacy setting (PUBLIC, CLOSED, SECRET)'),
});

interface GroupsFeedResponse {
  viewer?: {
    groups_tab?: {
      tab_groups_list?: {
        edges?: Array<{
          node?: {
            id?: string;
            name?: string;
            group_member_profiles?: { count?: number };
            url?: string;
            profile_picture?: { uri?: string };
            visibility?: string;
          };
        }>;
      };
    };
  };
}

export const listGroups = defineTool({
  name: 'list_groups',
  displayName: 'List Groups',
  description:
    'List Facebook groups the current user has joined. Returns group name, member count, privacy setting, and URL.',
  summary: 'List your joined groups',
  icon: 'users',
  group: 'Groups',
  input: z.object({}),
  output: z.object({
    groups: z.array(groupSchema),
  }),
  handle: async () => {
    const data = await graphql<GroupsFeedResponse>('GroupsCometLeftRailContainerQuery', { scale: 2 });

    const edges = data.viewer?.groups_tab?.tab_groups_list?.edges ?? [];

    return {
      groups: edges.map(e => {
        const g = e.node;
        return {
          id: g?.id ?? '',
          name: g?.name ?? '',
          member_count: g?.group_member_profiles?.count ?? 0,
          url: g?.url ?? (g?.id ? `https://www.facebook.com/groups/${g.id}` : ''),
          image_url: g?.profile_picture?.uri ?? '',
          privacy: g?.visibility ?? '',
        };
      }),
    };
  },
});
