import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { shelfSchema, mapTwoRowItem } from './schemas.js';
import type { BrowseResponse, RawTwoRowItem } from './schemas.js';

export const get_home = defineTool({
  name: 'get_home',
  displayName: 'Get Home Feed',
  description: 'Get the YouTube Music home feed with recommended music shelves',
  summary: 'Get personalized home feed with recommended music',
  icon: 'home',
  group: 'Browse',
  input: z.object({}),
  output: z.object({
    shelves: z.array(shelfSchema).describe('Home feed shelves with recommended content'),
  }),
  async handle() {
    const data = await api<BrowseResponse>('browse', {
      browseId: 'FEmusic_home',
    });

    const sections =
      data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
        ?.contents ?? [];

    const shelves = sections
      .map(section => {
        const carousel = section.musicCarouselShelfRenderer;
        if (!carousel) return null;

        const title =
          carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs
            ?.map((r: { text?: string }) => r.text ?? '')
            .join('') ?? '';

        const items: RawTwoRowItem[] = (carousel.contents ?? [])
          .map((c: { musicTwoRowItemRenderer?: RawTwoRowItem }) => c.musicTwoRowItemRenderer)
          .filter((r: RawTwoRowItem | undefined): r is RawTwoRowItem => r != null);

        return {
          title,
          items: items.map(mapTwoRowItem),
        };
      })
      .filter((s): s is { title: string; items: ReturnType<typeof mapTwoRowItem>[] } => s !== null);

    return { shelves };
  },
});
