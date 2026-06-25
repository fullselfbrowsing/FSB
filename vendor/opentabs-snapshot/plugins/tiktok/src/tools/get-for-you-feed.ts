import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tiktok-api.js';
import { videoSchema, mapVideo } from './schemas.js';
import type { RawVideoItem } from './schemas.js';

interface RecommendResponse {
  statusCode?: number;
  itemList?: RawVideoItem[];
  hasMore?: boolean;
}

export const getForYouFeed = defineTool({
  name: 'get_for_you_feed',
  displayName: 'Get For You Feed',
  description:
    'Get the personalized "For You" feed of recommended TikTok videos. Returns trending and personalized video content based on the user\'s interests and activity.',
  summary: 'Get personalized For You video feed',
  icon: 'sparkles',
  group: 'Feed',
  input: z.object({
    count: z.number().int().min(1).max(30).optional().describe('Number of videos to return (default 10, max 30)'),
  }),
  output: z.object({
    videos: z.array(videoSchema).describe('Recommended videos from the For You feed'),
    has_more: z.boolean().describe('Whether more videos are available'),
  }),
  handle: async params => {
    const count = params.count ?? 10;
    const data = await api<RecommendResponse>('/recommend/item_list/', {
      count,
    });

    const videos = (data.itemList ?? []).map(mapVideo);

    return {
      videos,
      has_more: data.hasMore ?? false,
    };
  },
});
