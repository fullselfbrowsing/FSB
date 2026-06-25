import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { artistSchema, songSchema, shelfSchema, mapArtistHeader, mapSong, mapTwoRowItem } from './schemas.js';
import type { BrowseResponse, RawMusicItem, RawTwoRowItem } from './schemas.js';

export const get_artist = defineTool({
  name: 'get_artist',
  displayName: 'Get Artist',
  description: 'Get an artist page with header info, top songs, and content sections',
  summary: 'Get artist page with top songs and discography',
  icon: 'mic-2',
  group: 'Artists',
  input: z.object({
    browse_id: z.string().describe('Artist channel ID (e.g., "UC..." browse ID)'),
  }),
  output: z.object({
    artist: artistSchema.describe('Artist header information'),
    top_songs: z.array(songSchema).describe('Top songs by this artist'),
    sections: z.array(shelfSchema).describe('Additional content sections (albums, singles, videos)'),
  }),
  async handle(params) {
    const data = await api<BrowseResponse>('browse', {
      browseId: params.browse_id,
    });

    type ArtistHeader = Parameters<typeof mapArtistHeader>[0];
    const header: ArtistHeader = data.header?.musicImmersiveHeaderRenderer ?? ({} as ArtistHeader);
    const artist = mapArtistHeader(header);

    const sections =
      data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
        ?.contents ?? [];

    const topSongs: RawMusicItem[] = [];
    const shelves: Array<{ title: string; items: ReturnType<typeof mapTwoRowItem>[] }> = [];

    for (const section of sections) {
      if (section.musicShelfRenderer) {
        const shelf = section.musicShelfRenderer;
        for (const entry of shelf.contents ?? []) {
          if (entry.musicResponsiveListItemRenderer) {
            topSongs.push(entry.musicResponsiveListItemRenderer);
          }
        }
      } else if (section.musicCarouselShelfRenderer) {
        const carousel = section.musicCarouselShelfRenderer;
        const title =
          carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs
            ?.map((r: { text?: string }) => r.text ?? '')
            .join('') ?? '';

        const items: RawTwoRowItem[] = (carousel.contents ?? [])
          .map((c: { musicTwoRowItemRenderer?: RawTwoRowItem }) => c.musicTwoRowItemRenderer)
          .filter((r: RawTwoRowItem | undefined): r is RawTwoRowItem => r != null);

        shelves.push({
          title,
          items: items.map(mapTwoRowItem),
        });
      }
    }

    return {
      artist,
      top_songs: topSongs.map(mapSong),
      sections: shelves,
    };
  },
});
