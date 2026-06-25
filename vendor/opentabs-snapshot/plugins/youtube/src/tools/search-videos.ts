import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type SearchResponse, mapVideo, videoSchema } from './schemas.js';

export const searchVideos = defineTool({
  name: 'search_videos',
  displayName: 'Search Videos',
  description:
    'Search YouTube for videos matching a query. Returns a list of videos with titles, channels, view counts, and thumbnails. Use the video_id from results with get_video for full details.',
  summary: 'Search YouTube for videos',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query text'),
  }),
  output: z.object({
    videos: z.array(videoSchema).describe('List of matching videos'),
  }),
  handle: async params => {
    const data = await api<SearchResponse>('search', {
      query: params.query,
    });

    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents;
    const videoRenderers = (items ?? []).flatMap(item => (item.videoRenderer ? [item.videoRenderer] : []));

    return { videos: videoRenderers.map(mapVideo) };
  },
});
