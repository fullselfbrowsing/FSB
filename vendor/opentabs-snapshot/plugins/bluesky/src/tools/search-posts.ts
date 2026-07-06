import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapPost, postSchema } from './schemas.js';

export const searchPosts = defineTool({
  name: 'search_posts',
  displayName: 'Search Posts',
  description:
    'Search for posts matching a query. Supports filtering by author, mentions, language, URL, domain, and tags. Results can be sorted by latest or top.',
  summary: 'Search posts by keyword',
  icon: 'search',
  group: 'Posts',
  input: z.object({
    q: z.string().describe('Search query string'),
    sort: z.enum(['top', 'latest']).optional().describe('Sort order (default: latest)'),
    author: z.string().optional().describe('Filter by author DID or handle'),
    lang: z.string().optional().describe('Filter by 2-letter language code'),
    domain: z.string().optional().describe('Filter by domain in post links'),
    url: z.string().optional().describe('Filter by URL in post links'),
    tag: z.string().optional().describe('Filter by hashtag (without the # symbol)'),
    since: z.string().optional().describe('Filter posts after this ISO 8601 date'),
    until: z.string().optional().describe('Filter posts before this ISO 8601 date'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results to return (1-100, default 25)'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('List of matching posts'),
    cursor: z.string().describe('Pagination cursor for the next page'),
  }),
  handle: async params => {
    const data = await api<{ posts: Record<string, unknown>[]; cursor?: string }>('app.bsky.feed.searchPosts', {
      query: {
        q: params.q,
        sort: params.sort,
        author: params.author,
        lang: params.lang,
        domain: params.domain,
        url: params.url,
        tag: params.tag,
        since: params.since,
        until: params.until,
        cursor: params.cursor,
        limit: params.limit,
      },
    });

    return {
      posts: (data.posts ?? []).map(mapPost),
      cursor: data.cursor ?? '',
    };
  },
});
