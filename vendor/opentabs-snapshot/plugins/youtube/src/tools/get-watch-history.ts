import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type BrowseResponse, type RawLockupViewModel, historyItemSchema, mapHistoryItem } from './schemas.js';

export const getWatchHistory = defineTool({
  name: 'get_watch_history',
  displayName: 'Get Watch History',
  description: "Get the user's watch history. Returns recently watched videos with titles and metadata.",
  summary: 'Get recent watch history',
  icon: 'history',
  group: 'Feed',
  input: z.object({}),
  output: z.object({
    items: z.array(historyItemSchema).describe('List of recently watched videos'),
  }),
  handle: async () => {
    const data = await api<BrowseResponse>('browse', {
      browseId: 'FEhistory',
    });

    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
    const sections = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

    const items: RawLockupViewModel[] = [];
    for (const section of sections ?? []) {
      const sectionContents = section?.itemSectionRenderer?.contents;
      for (const item of sectionContents ?? []) {
        if (item?.lockupViewModel) {
          items.push(item.lockupViewModel);
        }
        if (item?.videoRenderer) {
          // Fallback for older format
          items.push({
            contentId: item.videoRenderer.videoId,
            contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            metadata: {
              lockupMetadataViewModel: {
                title: { content: item.videoRenderer.title?.runs?.[0]?.text ?? '' },
              },
            },
          });
        }
      }
    }

    return { items: items.slice(0, 30).map(mapHistoryItem) };
  },
});
