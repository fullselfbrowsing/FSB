import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface MeResponse {
  kind: string;
  data: {
    name: string;
    id: string;
    total_karma: number;
    link_karma: number;
    comment_karma: number;
    has_verified_email: boolean;
    is_gold: boolean;
    is_mod: boolean;
    created_utc: number;
    icon_img: string;
    subreddit?: {
      display_name_prefixed: string;
      subscribers: number;
    };
  };
}

export const getMe = defineTool({
  name: 'get_me',
  displayName: 'Get My Profile',
  description: "Get the authenticated user's Reddit profile including username, karma, and account details",
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'User',
  input: z.object({}),
  output: z.object({
    name: z.string().describe('Reddit username'),
    id: z.string().describe('User ID'),
    total_karma: z.number().describe('Total karma (link + comment)'),
    link_karma: z.number().describe('Post/link karma'),
    comment_karma: z.number().describe('Comment karma'),
    has_verified_email: z.boolean().describe('Whether the user has verified their email'),
    is_gold: z.boolean().describe('Whether the user has Reddit Premium'),
    is_mod: z.boolean().describe('Whether the user is a moderator of any subreddit'),
    created_utc: z.number().describe('Account creation time as Unix timestamp'),
  }),
  handle: async () => {
    const data = await redditGet<MeResponse>('/user/me/about.json');
    const u = data.data;
    return {
      name: u.name,
      id: u.id,
      total_karma: u.total_karma,
      link_karma: u.link_karma,
      comment_karma: u.comment_karma,
      has_verified_email: u.has_verified_email,
      is_gold: u.is_gold,
      is_mod: u.is_mod,
      created_utc: u.created_utc,
    };
  },
});
