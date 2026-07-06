import type { RedditListing } from '../reddit-api.js';
import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface SubscribedSubreddit {
  display_name: string;
  title: string;
  subscribers: number;
  url: string;
  public_description: string;
  over18: boolean;
  subreddit_type: string;
  created_utc: number;
}

export const listSubscriptions = defineTool({
  name: 'list_subscriptions',
  displayName: 'List Subscriptions',
  description: 'List subreddits the authenticated user is subscribed to',
  summary: 'List subscribed subreddits',
  icon: 'list',
  group: 'Subreddits',
  input: z.object({
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
          url: z.string().describe('Subreddit URL path'),
          public_description: z.string().describe('Short description'),
        }),
      )
      .describe('Subscribed subreddits'),
    after: z.string().nullable().describe('Pagination cursor for next page'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {
      limit: String(params.limit ?? 25),
    };
    if (params.after) queryParams.after = params.after;

    const data = await redditGet<RedditListing<SubscribedSubreddit>>('/subreddits/mine/subscriber.json', queryParams);

    return {
      subreddits: data.data.children.map(child => ({
        display_name: child.data.display_name,
        title: child.data.title,
        subscribers: child.data.subscribers,
        url: child.data.url,
        public_description: child.data.public_description ?? '',
      })),
      after: data.data.after ?? null,
    };
  },
});
