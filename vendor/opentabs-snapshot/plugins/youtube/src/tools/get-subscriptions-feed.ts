import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type BrowseResponse, mapHistoryItem, mapVideo, videoSchema } from './schemas.js';

export const getSubscriptionsFeed = defineTool({
  name: 'get_subscriptions_feed',
  displayName: 'Get Subscriptions Feed',
  description:
    'Get recent videos from subscribed channels. Returns the latest uploads from channels the user is subscribed to.',
  summary: 'Get latest videos from subscriptions',
  icon: 'rss',
  group: 'Feed',
  input: z.object({}),
  output: z.object({
    videos: z.array(videoSchema).describe('List of recent subscription videos'),
  }),
  handle: async () => {
    const data = await api<BrowseResponse>('browse', {
      browseId: 'FEsubscriptions',
    });

    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
    const richGrid = tabs?.[0]?.tabRenderer?.content?.richGridRenderer;
    const contents = richGrid?.contents;

    // Subscription feed items may use videoRenderer (legacy) or lockupViewModel (current)
    const videos = (contents ?? [])
      .flatMap(item => {
        const content = item.richItemRenderer?.content;
        if (!content) return [];
        if (content.videoRenderer) return [mapVideo(content.videoRenderer)];
        if (content.lockupViewModel) {
          const h = mapHistoryItem(content.lockupViewModel);
          return [
            {
              video_id: h.video_id,
              title: h.title,
              channel_name: '',
              channel_id: '',
              view_count: h.metadata,
              published_time: '',
              duration: '',
              thumbnail_url: '',
              description_snippet: '',
            },
          ];
        }
        return [];
      })
      .slice(0, 20);

    return { videos };
  },
});
