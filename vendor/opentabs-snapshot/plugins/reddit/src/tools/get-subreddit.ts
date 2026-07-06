import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface SubredditResponse {
  kind: string;
  data: {
    display_name: string;
    title: string;
    public_description: string;
    description: string;
    subscribers: number;
    active_user_count: number;
    created_utc: number;
    over18: boolean;
    url: string;
    icon_img: string;
    banner_img: string;
    subreddit_type: string;
  };
}

export const getSubreddit = defineTool({
  name: 'get_subreddit',
  displayName: 'Get Subreddit Info',
  description: 'Get detailed information about a subreddit including description, subscriber count, and rules',
  summary: 'Get subreddit details',
  icon: 'info',
  group: 'Subreddits',
  input: z.object({
    subreddit: z.string().min(1).describe('Subreddit name without the r/ prefix (e.g., "programming")'),
  }),
  output: z.object({
    display_name: z.string().describe('Subreddit display name'),
    title: z.string().describe('Subreddit title'),
    public_description: z.string().describe('Short public description'),
    description: z.string().describe('Full description (markdown)'),
    subscribers: z.number().describe('Number of subscribers'),
    active_user_count: z.number().describe('Number of currently active users'),
    created_utc: z.number().describe('Creation time as Unix timestamp'),
    over18: z.boolean().describe('Whether the subreddit is NSFW'),
    url: z.string().describe('Subreddit URL path (e.g., "/r/programming/")'),
    subreddit_type: z.string().describe('Subreddit type (public, restricted, private)'),
  }),
  handle: async params => {
    const data = await redditGet<SubredditResponse>(`/r/${params.subreddit}/about.json`);
    const s = data.data;
    return {
      display_name: s.display_name,
      title: s.title,
      public_description: s.public_description ?? '',
      description: s.description ?? '',
      subscribers: s.subscribers,
      active_user_count: s.active_user_count ?? 0,
      created_utc: s.created_utc,
      over18: s.over18,
      url: s.url,
      subreddit_type: s.subreddit_type,
    };
  },
});
