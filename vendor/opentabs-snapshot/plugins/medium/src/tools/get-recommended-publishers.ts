import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { publisherSchema, type RawPublisher, mapPublisher } from './schemas.js';

interface RecommendedPublishersData {
  recommendedPublishers: {
    edges: Array<{
      node: RawPublisher;
      cursor: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string;
    };
  };
}

export const getRecommendedPublishers = defineTool({
  name: 'get_recommended_publishers',
  displayName: 'Get Recommended Publishers',
  description: 'Get personalized publisher recommendations — users and publications to follow based on your interests.',
  summary: 'Get recommended accounts to follow',
  icon: 'users',
  group: 'Users',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Maximum recommendations to return (default 10)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    publishers: z.array(publisherSchema),
    has_next: z.boolean().describe('Whether more results are available'),
    end_cursor: z.string().describe('Cursor for the next page (empty if no more)'),
  }),
  handle: async params => {
    const first = params.limit ?? 10;
    const after = params.cursor ?? '';
    const data = await gql<RecommendedPublishersData>(
      'RecommendedPublishersQuery',
      `query RecommendedPublishersQuery($first: Int!, $after: String!) {
        recommendedPublishers(first: $first, after: $after, mode: ALL) {
          edges {
            node {
              __typename
              ... on User { id name bio username }
              ... on Collection { id name description slug }
            }
            cursor
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { first, after },
    );
    const edges = data.recommendedPublishers?.edges ?? [];
    return {
      publishers: edges.map(e => mapPublisher(e.node)),
      has_next: data.recommendedPublishers?.pageInfo?.hasNextPage ?? false,
      end_cursor: data.recommendedPublishers?.pageInfo?.endCursor ?? '',
    };
  },
});
