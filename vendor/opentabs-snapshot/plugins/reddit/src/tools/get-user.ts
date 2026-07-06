import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface UserResponse {
  kind: string;
  data: {
    name: string;
    id: string;
    total_karma: number;
    link_karma: number;
    comment_karma: number;
    created_utc: number;
    is_gold: boolean;
    is_mod: boolean;
    icon_img: string;
    subreddit?: {
      display_name_prefixed: string;
      title: string;
      public_description: string;
      subscribers: number;
    };
  };
}

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get User',
  description: 'Get public profile information for a Reddit user by username',
  summary: 'Get a user profile',
  icon: 'user',
  group: 'User',
  input: z.object({
    username: z.string().min(1).describe('Reddit username (without u/ prefix)'),
  }),
  output: z.object({
    name: z.string().describe('Username'),
    id: z.string().describe('User ID'),
    total_karma: z.number().describe('Total karma'),
    link_karma: z.number().describe('Post karma'),
    comment_karma: z.number().describe('Comment karma'),
    created_utc: z.number().describe('Account creation timestamp'),
    is_gold: z.boolean().describe('Whether the user has Reddit Premium'),
    is_mod: z.boolean().describe('Whether the user is a moderator'),
    description: z.string().describe('User profile description'),
  }),
  handle: async params => {
    const data = await redditGet<UserResponse>(`/user/${params.username}/about.json`);
    const u = data.data;
    return {
      name: u.name,
      id: u.id,
      total_karma: u.total_karma,
      link_karma: u.link_karma,
      comment_karma: u.comment_karma,
      created_utc: u.created_utc,
      is_gold: u.is_gold,
      is_mod: u.is_mod,
      description: u.subreddit?.public_description ?? '',
    };
  },
});
