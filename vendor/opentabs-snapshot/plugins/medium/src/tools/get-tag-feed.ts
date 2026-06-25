import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { postSummarySchema, type RawPost, mapPostSummary } from './schemas.js';

interface TagFeedItem {
  feedId?: string;
  post?: RawPost;
}

interface TagFeedData {
  personalisedTagFeed: {
    items: TagFeedItem[];
    pagingInfo: { next: { limit: number; page: number } | null };
  };
}

export const getTagFeed = defineTool({
  name: 'get_tag_feed',
  displayName: 'Get Tag Feed',
  description:
    'Get personalized posts for a specific tag/topic. Returns recent and recommended posts for the given tag slug.',
  summary: 'Get posts by tag',
  icon: 'hash',
  group: 'Posts',
  input: z.object({
    tag_slug: z.string().describe('Tag slug (e.g., "javascript", "data-science", "self-improvement")'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum results to return (default 10)'),
  }),
  output: z.object({
    posts: z.array(postSummarySchema),
    has_next: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const limit = params.limit ?? 10;
    const data = await gql<TagFeedData>(
      'TagFeedQuery',
      `query TagFeedQuery($tagSlug: String!, $paging: PagingOptions!) {
        personalisedTagFeed(tagSlug: $tagSlug, paging: $paging) {
          items {
            feedId
            post {
              id title uniqueSlug mediumUrl firstPublishedAt readingTime clapCount voterCount isLocked
              creator { id name username }
              collection { id name slug }
              extendedPreviewContent { subtitle }
            }
          }
          pagingInfo { next { limit page } }
        }
      }`,
      { tagSlug: params.tag_slug, paging: { limit } },
    );
    const posts = (data.personalisedTagFeed?.items ?? [])
      .filter((item): item is TagFeedItem & { post: RawPost } => item.post !== undefined)
      .map(item => mapPostSummary(item.post));
    return {
      posts,
      has_next: data.personalisedTagFeed?.pagingInfo?.next !== null,
    };
  },
});
