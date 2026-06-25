import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getViewerId } from '../medium-api.js';
import { postSummarySchema, type RawPost, mapPostSummary } from './schemas.js';

interface ReadingListData {
  getPredefinedCatalog: {
    id: string;
    itemsConnection: {
      items: Array<{
        catalogItemId: string;
        entity: RawPost;
      }>;
      paging: { count: number };
    };
  } | null;
}

export const getReadingList = defineTool({
  name: 'get_reading_list',
  displayName: 'Get Reading List',
  description: "Get the current user's reading list (saved/bookmarked posts) on Medium.",
  summary: 'Get your saved posts',
  icon: 'bookmark',
  group: 'Reading List',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Maximum items to return (default 20)'),
  }),
  output: z.object({
    total_count: z.number().describe('Total items in reading list'),
    posts: z.array(postSummarySchema),
  }),
  handle: async params => {
    const viewerId = getViewerId();
    const limit = params.limit ?? 20;
    const data = await gql<ReadingListData>(
      'ReadingListQuery',
      `query ReadingListQuery($viewerId: ID!, $limit: Int!) {
        getPredefinedCatalog(userId: $viewerId, type: READING_LIST) {
          ... on Catalog {
            id
            itemsConnection(pagingOptions: {limit: $limit}) {
              items {
                catalogItemId
                entity {
                  ... on Post {
                    id title uniqueSlug mediumUrl firstPublishedAt readingTime clapCount voterCount isLocked
                    creator { id name username }
                    collection { id name slug }
                    extendedPreviewContent { subtitle }
                  }
                }
              }
              paging { count }
            }
          }
        }
      }`,
      { viewerId, limit },
    );
    const catalog = data.getPredefinedCatalog;
    return {
      total_count: catalog?.itemsConnection?.paging?.count ?? 0,
      posts: (catalog?.itemsConnection?.items ?? [])
        .filter(item => item.entity)
        .map(item => mapPostSummary(item.entity)),
    };
  },
});
