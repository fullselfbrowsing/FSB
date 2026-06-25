import type { RedditListing } from '../reddit-api.js';
import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface PopularSubreddit {
  display_name: string;
  title: string;
  subscribers: number;
  url: string;
  public_description: string;
  over18: boolean;
  active_user_count: number;
  created_utc: number;
}

export const listPopularSubreddits = defineTool({
  name: 'list_popular_subreddits',
  displayName: 'List Popular Subreddits',
  description:
    'List popular, new, or default subreddits. Use category "popular" for most popular, "new" for newest, or "default" for default subreddits.',
  summary: 'List popular subreddits',
  icon: 'trending-up',
  group: 'Subreddits',
  input: z.object({
    category: z
      .enum(['popular', 'new', 'default'])
      .optional()
      .describe('Subreddit category to list (default "popular")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 25, max 100)'),
    after: z.string().optional().describe('Pagination cursor for the next page'),
  }),
  output: z.object({
    subreddits: z
      .array(
        z.object({
          display_name: z.string().describe('Subreddit name'),
          title: z.string().describe('Subreddit title'),
          subscribers: z.number().describe('Subscriber count'),
          active_user_count: z.number().describe('Active users online'),
          url: z.string().describe('Subreddit URL path'),
          public_description: z.string().describe('Short description'),
          over18: z.boolean().describe('NSFW flag'),
        }),
      )
      .describe('Subreddits'),
    after: z.string().nullable().describe('Pagination cursor for next page'),
  }),
  handle: async params => {
    const category = params.category ?? 'popular';
    const queryParams: Record<string, string> = {
      limit: String(params.limit ?? 25),
    };
    if (params.after) queryParams.after = params.after;

    const data = await redditGet<RedditListing<PopularSubreddit>>(`/subreddits/${category}.json`, queryParams);

    return {
      subreddits: data.data.children.map(child => ({
        display_name: child.data.display_name,
        title: child.data.title,
        subscribers: child.data.subscribers,
        active_user_count: child.data.active_user_count ?? 0,
        url: child.data.url,
        public_description: child.data.public_description ?? '',
        over18: child.data.over18,
      })),
      after: data.data.after ?? null,
    };
  },
});
