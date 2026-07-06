import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type BrowseResponse, mapLockupToVideo, mapVideo, videoSchema } from './schemas.js';

export const getHomeFeed = defineTool({
  name: 'get_home_feed',
  displayName: 'Get Home Feed',
  description:
    'Get the personalized YouTube home feed. Returns recommended videos based on viewing history and subscriptions.',
  summary: 'Get personalized home feed',
  icon: 'home',
  group: 'Feed',
  input: z.object({}),
  output: z.object({
    videos: z.array(videoSchema).describe('List of recommended videos'),
  }),
  handle: async () => {
    const data = await api<BrowseResponse>('browse', {
      browseId: 'FEwhat_to_watch',
    });

    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
    const contents = tabs?.[0]?.tabRenderer?.content?.richGridRenderer?.contents;

    const videos = (contents ?? [])
      .flatMap(item => {
        const content = item.richItemRenderer?.content;
        if (!content) return [];
        if (content.videoRenderer) return [mapVideo(content.videoRenderer)];
        if (content.lockupViewModel) return [mapLockupToVideo(content.lockupViewModel)];
        return [];
      })
      .slice(0, 20);

    return { videos };
  },
});
