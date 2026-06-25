// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../reddit-api.js';

export const searchPosts = defineTool({
  name: 'search_posts',
  displayName: 'Search Posts',
  description: 'Search Reddit posts by a query string, optionally restricted to a single subreddit.',
  summary: 'search reddit for posts',
  icon: 'search',
  group: 'Posts',
  input: z.object({
    query: z.string().min(1).describe('The search query text'),
    subreddit: z.string().optional().describe('Restrict the search to this subreddit (omit to search all of Reddit)'),
    sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().describe('Sort order for the results'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of results to return (1-100)'),
  }),
  output: z.object({
    results: z.array(z.object({
      id: z.string(),
      title: z.string(),
      subreddit: z.string(),
    })).describe('Matching posts'),
  }),
  handle: async (params: { query: string; subreddit?: string; sort?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /search.json (or /r/:subreddit/search.json) (read).
    const path = params.subreddit ? `/r/${params.subreddit}/search.json` : '/search.json';
    const data = await api<{ results: unknown[] }>(path, {
      method: 'GET',
      query: { q: params.query, sort: params.sort, limit: params.limit, restrict_sr: params.subreddit ? true : undefined },
    });
    return { results: data.results as { id: string; title: string; subreddit: string }[] };
  },
});
