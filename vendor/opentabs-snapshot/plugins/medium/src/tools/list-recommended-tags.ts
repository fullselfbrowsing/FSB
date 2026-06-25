import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { tagSchema, type RawTag, mapTag } from './schemas.js';

interface RecommendedTagsData {
  recommendedTags: {
    edges: Array<{ node: RawTag }>;
  };
}

export const listRecommendedTags = defineTool({
  name: 'list_recommended_tags',
  displayName: 'List Recommended Tags',
  description: 'Get personalized recommended tags/topics. Returns popular and trending tags tailored to the user.',
  summary: 'Get recommended tags',
  icon: 'tags',
  group: 'Tags',
  input: z.object({
    limit: z.number().int().min(1).max(30).optional().describe('Maximum tags to return (default 20)'),
  }),
  output: z.object({
    tags: z.array(tagSchema),
  }),
  handle: async params => {
    const first = params.limit ?? 20;
    const data = await gql<RecommendedTagsData>(
      'RecommendedTagsQuery',
      `query RecommendedTagsQuery($first: Int!) {
        recommendedTags(input: {first: $first}) {
          edges {
            node { id displayTitle normalizedTagSlug }
          }
        }
      }`,
      { first },
    );
    return {
      tags: (data.recommendedTags?.edges ?? []).map(e => mapTag(e.node)),
    };
  },
});
