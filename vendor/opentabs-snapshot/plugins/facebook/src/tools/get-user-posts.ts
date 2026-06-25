import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';
import { type RawPostEdge, mapPost, postSchema } from './schemas.js';

interface TimelineFeedResponse {
  user?: {
    id?: string;
    timeline_list_feed_units?: {
      edges?: RawPostEdge[];
      page_info?: { has_next_page?: boolean; end_cursor?: string };
    };
  };
}

export const getUserPosts = defineTool({
  name: 'get_user_posts',
  displayName: 'Get User Posts',
  description:
    "Get posts from a Facebook user's timeline by their user ID. Returns post text, author, timestamp, attachments, and feedback IDs for reactions. Use the cursor parameter to paginate.",
  summary: "Get a user's timeline posts",
  icon: 'file-text',
  group: 'Posts',
  input: z.object({
    user_id: z.string().describe('Facebook user ID (numeric string)'),
    count: z.number().int().min(1).max(20).optional().describe('Number of posts to return (default 5, max 20)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    posts: z.array(postSchema),
    has_next_page: z.boolean().describe('Whether more posts are available'),
    end_cursor: z.string().describe('Cursor for the next page, empty if no more'),
  }),
  handle: async params => {
    const variables: Record<string, unknown> = {
      userID: params.user_id,
      count: params.count ?? 5,
      scale: 2,
    };
    if (params.cursor) {
      variables.cursor = params.cursor;
    }

    const data = await graphql<TimelineFeedResponse>('ProfileCometTimelineFeedQuery', variables);

    const feed = data.user?.timeline_list_feed_units;
    const edges = feed?.edges ?? [];

    return {
      posts: edges.map(mapPost),
      has_next_page: feed?.page_info?.has_next_page ?? false,
      end_cursor: feed?.page_info?.end_cursor ?? '',
    };
  },
});
