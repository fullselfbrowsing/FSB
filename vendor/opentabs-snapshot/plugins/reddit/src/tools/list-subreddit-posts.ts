// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../reddit-api.js';

export const listSubredditPosts = defineTool({
  name: 'list_subreddit_posts',
  displayName: 'List Subreddit Posts',
  description: 'List posts in a subreddit, sorted hot/new/top/rising. Optionally page through with an after cursor.',
  summary: 'show posts in a subreddit on reddit',
  icon: 'list',
  group: 'Posts',
  input: z.object({
    subreddit: z.string().min(1).describe('The subreddit name to list posts from (without the r/ prefix)'),
    sort: z.enum(['hot', 'new', 'top', 'rising']).optional().describe('Sort order for the posts'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of posts to return (1-100)'),
    after: z.string().optional().describe('Fullname cursor of the last post on the previous page (pagination)'),
  }),
  output: z.object({
    posts: z.array(z.object({
      id: z.string(),
      title: z.string(),
      author: z.string(),
    })).describe('Posts in the subreddit'),
  }),
  handle: async (params: { subreddit: string; sort?: string; limit?: number; after?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /r/:subreddit/:sort.json (read).
    const data = await api<{ posts: unknown[] }>(`/r/${params.subreddit}/${params.sort || 'hot'}.json`, {
      method: 'GET',
      query: { limit: params.limit, after: params.after },
    });
    return { posts: data.posts as { id: string; title: string; author: string }[] };
  },
});
