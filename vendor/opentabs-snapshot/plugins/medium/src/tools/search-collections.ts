import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';

const collectionSummarySchema = z.object({
  id: z.string().describe('Collection ID'),
  name: z.string().describe('Collection name'),
  slug: z.string().describe('URL slug'),
  description: z.string().describe('Collection description'),
  subscriber_count: z.number().describe('Number of subscribers'),
});

interface RawSearchCollection {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  subscriberCount?: number;
}

interface SearchCollectionsData {
  search: {
    collections: {
      items: RawSearchCollection[];
      pagingInfo: { next: { limit: number; page: number } | null };
    };
  };
}

export const searchCollections = defineTool({
  name: 'search_collections',
  displayName: 'Search Collections',
  description:
    'Search for Medium publications/collections by keyword. Returns matching publications with subscriber counts.',
  summary: 'Search for publications by keyword',
  icon: 'search',
  group: 'Collections',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum results to return (default 10)'),
    page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  }),
  output: z.object({
    collections: z.array(collectionSummarySchema),
    has_next: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const limit = params.limit ?? 10;
    const page = params.page ?? 0;
    const data = await gql<SearchCollectionsData>(
      'SearchCollectionsQuery',
      `query SearchCollectionsQuery($query: String!, $pagingOptions: SearchPagingOptions) {
        search(query: $query) {
          ... on Search {
            collections(pagingOptions: $pagingOptions) {
              ... on SearchCollection {
                items { id name slug description subscriberCount }
                pagingInfo { next { limit page } }
              }
            }
          }
        }
      }`,
      { query: params.query, pagingOptions: { limit, page } },
    );
    const items = data.search?.collections?.items ?? [];
    return {
      collections: items.map(c => ({
        id: c.id ?? '',
        name: c.name ?? '',
        slug: c.slug ?? '',
        description: c.description ?? '',
        subscriber_count: c.subscriberCount ?? 0,
      })),
      has_next: data.search?.collections?.pagingInfo?.next !== null,
    };
  },
});
