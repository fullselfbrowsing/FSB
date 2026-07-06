import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { tagSchema, type RawTag, mapTag } from './schemas.js';

interface SearchTagsData {
  search: {
    tags: {
      items: RawTag[];
      pagingInfo: { next: { limit: number; page: number } | null };
    };
  };
}

export const searchTags = defineTool({
  name: 'search_tags',
  displayName: 'Search Tags',
  description: 'Search for Medium tags/topics by keyword. Returns matching tags with post counts.',
  summary: 'Search for tags by keyword',
  icon: 'search',
  group: 'Tags',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum results to return (default 10)'),
    page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  }),
  output: z.object({
    tags: z.array(tagSchema),
    has_next: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const limit = params.limit ?? 10;
    const page = params.page ?? 0;
    const data = await gql<SearchTagsData>(
      'SearchTagsQuery',
      `query SearchTagsQuery($query: String!, $pagingOptions: SearchPagingOptions) {
        search(query: $query) {
          ... on Search {
            tags(pagingOptions: $pagingOptions) {
              ... on SearchTag {
                items { id displayTitle normalizedTagSlug postCount }
                pagingInfo { next { limit page } }
              }
            }
          }
        }
      }`,
      { query: params.query, pagingOptions: { limit, page } },
    );
    return {
      tags: (data.search?.tags?.items ?? []).map(mapTag),
      has_next: data.search?.tags?.pagingInfo?.next !== null,
    };
  },
});
