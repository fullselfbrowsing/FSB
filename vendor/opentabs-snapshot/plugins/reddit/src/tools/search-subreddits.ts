import type { RedditListing } from '../reddit-api.js';
import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface SubredditSearchResult {
  display_name: string;
  title: string;
  subscribers: number;
  url: string;
  public_description: string;
  over18: boolean;
  subreddit_type: string;
  created_utc: number;
  active_user_count: number;
}

export const searchSubreddits = defineTool({
  name: 'search_subreddits',
  displayName: 'Search Subreddits',
  description: 'Search for subreddits by name or topic',
  summary: 'Search subreddits',
  icon: 'search',
  group: 'Subreddits',
  input: z.object({
    query: z.string().min(1).describe('Search query'),
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
          active_user_count: z.number().describe('Active users'),
          url: z.string().describe('Subreddit URL path'),
          public_description: z.string().describe('Short description'),
          over18: z.boolean().describe('NSFW flag'),
        }),
      )
      .describe('Matching subreddits'),
    after: z.string().nullable().describe('Pagination cursor for next page'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {
      q: params.query,
      limit: String(params.limit ?? 25),
    };
    if (params.after) queryParams.after = params.after;

    const data = await redditGet<RedditListing<SubredditSearchResult>>('/subreddits/search.json', queryParams);

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
