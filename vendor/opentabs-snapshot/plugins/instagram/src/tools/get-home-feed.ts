import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawMedia, mapMedia, mediaSchema } from './schemas.js';

interface FeedResponse {
  feed_items?: { media_or_ad?: RawMedia }[];
  more_available?: boolean;
  next_max_id?: string;
}

export const getHomeFeed = defineTool({
  name: 'get_home_feed',
  displayName: 'Get Home Feed',
  description:
    "Get the authenticated user's home feed (timeline). Returns posts from followed accounts and suggested content.",
  summary: 'Get the home timeline feed',
  icon: 'home',
  group: 'Feed',
  input: z.object({
    max_id: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    posts: z.array(mediaSchema).describe('Feed posts'),
    more_available: z.boolean().describe('Whether more posts are available'),
    next_max_id: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const body = params.max_id
      ? `reason=pagination&max_id=${encodeURIComponent(params.max_id)}`
      : 'reason=cold_start_fetch&feed_view_info=';

    const data = await api<FeedResponse>('/feed/timeline/', { method: 'POST', body, formEncoded: true });

    const posts = (data.feed_items ?? [])
      .filter((item): item is { media_or_ad: RawMedia } => !!item.media_or_ad)
      .map(item => mapMedia(item.media_or_ad));

    return {
      posts,
      more_available: data.more_available ?? false,
      next_max_id: data.next_max_id ?? '',
    };
  },
});
