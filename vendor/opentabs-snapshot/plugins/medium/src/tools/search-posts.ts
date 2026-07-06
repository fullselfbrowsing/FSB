import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { postSummarySchema, type RawPost, mapPostSummary } from './schemas.js';

interface SearchData {
  search: {
    posts: {
      items: RawPost[];
      pagingInfo: { next: { limit: number; page: number } | null };
    };
  };
}

export const searchPosts = defineTool({
  name: 'search_posts',
  displayName: 'Search Posts',
  description:
    'Search for Medium posts by keyword. Returns post titles, authors, clap counts, and reading times. Use page parameter to paginate through results.',
  summary: 'Search for posts by keyword',
  icon: 'search',
  group: 'Posts',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum results to return (default 10, max 25)'),
    page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  }),
  output: z.object({
    posts: z.array(postSummarySchema),
    has_next: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const limit = params.limit ?? 10;
    const page = params.page ?? 0;
    const data = await gql<SearchData>(
      'SearchQuery',
      `query SearchQuery($query: String!, $pagingOptions: SearchPagingOptions) {
        search(query: $query) {
          ... on Search {
            posts(pagingOptions: $pagingOptions) {
              ... on SearchPost {
                items {
                  id title uniqueSlug mediumUrl firstPublishedAt readingTime clapCount voterCount isLocked
                  creator { id name username }
                  collection { id name slug }
                  extendedPreviewContent { subtitle }
                }
                pagingInfo { next { limit page } }
              }
            }
          }
        }
      }`,
      { query: params.query, pagingOptions: { limit, page } },
    );
    return {
      posts: (data.search?.posts?.items ?? []).map(mapPostSummary),
      has_next: data.search?.posts?.pagingInfo?.next !== null,
    };
  },
});
