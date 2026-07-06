import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { songSchema, mapSong } from './schemas.js';
import type { SearchResponse, RawMusicItem } from './schemas.js';

const FILTER_PARAMS: Record<string, string> = {
  songs: 'EgWKAQIIAWoMEAMQBBAJEA4QChAF',
  albums: 'EgWKAQIYAWoMEAMQBBAJEA4QChAF',
  artists: 'EgWKAQIgAWoMEAMQBBAJEA4QChAF',
  playlists: 'Eg-KAQwIABAAGAAgACgAMABqChADEAQQCRAOEAU%3D',
  videos: 'EgWKAQIQAWoMEAMQBBAJEA4QChAF',
};

export const search = defineTool({
  name: 'search',
  displayName: 'Search',
  description: 'Search YouTube Music for songs, albums, artists, playlists, or videos',
  summary: 'Search YouTube Music for songs, albums, artists, playlists, or videos',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query text'),
    filter: z
      .enum(['songs', 'albums', 'artists', 'playlists', 'videos'])
      .optional()
      .describe('Filter results by content type. Defaults to songs if omitted'),
  }),
  output: z.object({
    songs: z.array(songSchema).describe('List of search results'),
  }),
  async handle(params) {
    const filterParams = FILTER_PARAMS[params.filter ?? 'songs'];
    const data = await api<SearchResponse>('search', {
      query: params.query,
      params: filterParams,
    });

    const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs ?? [];
    const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

    const items: RawMusicItem[] = [];
    for (const section of sections) {
      const shelf = section.musicShelfRenderer;
      if (!shelf?.contents) continue;
      for (const entry of shelf.contents) {
        if (entry.musicResponsiveListItemRenderer) {
          items.push(entry.musicResponsiveListItemRenderer);
        }
      }
    }

    return { songs: items.map(mapSong) };
  },
});
