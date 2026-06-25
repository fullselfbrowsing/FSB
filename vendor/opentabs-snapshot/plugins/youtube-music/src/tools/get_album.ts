import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { albumSchema, songSchema, mapAlbumHeader, mapSong } from './schemas.js';
import type { BrowseResponse, RawMusicItem, RawAlbumHeader } from './schemas.js';

export const get_album = defineTool({
  name: 'get_album',
  displayName: 'Get Album',
  description: 'Get album details and track listing',
  summary: 'Get album details and track listing',
  icon: 'disc-3',
  group: 'Albums',
  input: z.object({
    browse_id: z.string().describe('Album browse ID (e.g., "MPREb_...")'),
  }),
  output: z.object({
    album: albumSchema.describe('Album header information'),
    tracks: z.array(songSchema).describe('Tracks on the album'),
  }),
  async handle(params) {
    const data = await api<BrowseResponse>('browse', {
      browseId: params.browse_id,
    });

    const tabContent =
      data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content ??
      data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content;

    const headerRenderer: RawAlbumHeader | undefined =
      tabContent?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;

    const trackSection =
      data.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]
        ?.musicShelfRenderer ?? tabContent?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer;

    const trackItems: RawMusicItem[] = (trackSection?.contents ?? [])
      .map((entry: { musicResponsiveListItemRenderer?: RawMusicItem }) => entry.musicResponsiveListItemRenderer)
      .filter((r: RawMusicItem | undefined): r is RawMusicItem => r != null);

    const album = mapAlbumHeader(headerRenderer ?? ({} as RawAlbumHeader), trackItems.length);

    return {
      album,
      tracks: trackItems.map(mapSong),
    };
  },
});
