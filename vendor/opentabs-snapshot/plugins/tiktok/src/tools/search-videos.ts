import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tiktok-api.js';
import { videoSchema, mapVideo } from './schemas.js';
import type { RawVideoItem } from './schemas.js';

interface SearchGeneralResponse {
  status_code?: number;
  data?: Array<{
    type?: number;
    item?: RawVideoItem;
  }>;
  has_more?: number | boolean;
  cursor?: number;
}

export const searchVideos = defineTool({
  name: 'search_videos',
  displayName: 'Search Videos',
  description:
    'Search for TikTok videos by keyword. Returns videos matching the query with engagement stats. Results include video description, author, play count, likes, comments, shares, and music info. Use offset and cursor for pagination.',
  summary: 'Search for videos by keyword',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query text (e.g., "funny cats", "cooking tips")'),
    count: z.number().int().min(1).max(20).optional().describe('Number of results to return (default 12, max 20)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset from a previous response cursor (default 0)'),
  }),
  output: z.object({
    videos: z.array(videoSchema).describe('Matching video results'),
    has_more: z.boolean().describe('Whether more results are available'),
    cursor: z.number().int().describe('Cursor value for the next page of results'),
  }),
  handle: async params => {
    const count = params.count ?? 12;
    const offset = params.offset ?? 0;

    const data = await api<SearchGeneralResponse>('/search/general/full/', {
      keyword: params.query,
      count,
      offset,
      search_source: 'normal_search',
    });

    // type=1 entries are video results; type=4 is user suggestions
    const videos = (data.data ?? [])
      .filter((entry): entry is typeof entry & { item: RawVideoItem } => entry.type === 1 && entry.item !== undefined)
      .map(entry => mapVideo(entry.item));

    return {
      videos,
      has_more: data.has_more === 1 || data.has_more === true,
      cursor: data.cursor ?? 0,
    };
  },
});
