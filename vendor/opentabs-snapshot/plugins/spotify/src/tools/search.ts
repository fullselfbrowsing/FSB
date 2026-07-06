import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../spotify-api.js';
import {
  type RawSearchResponse,
  mapSearchResults,
  searchAlbumSchema,
  searchArtistSchema,
  searchPlaylistSchema,
  searchTrackSchema,
} from './schemas.js';

export const search = defineTool({
  name: 'search',
  displayName: 'Search',
  description:
    'Search Spotify for tracks, artists, albums, and playlists by keyword. Returns results across all content types.',
  summary: 'Search Spotify catalog',
  icon: 'search',
  group: 'Browse',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results per type (default 10, max 50)'),
    offset: z.number().int().min(0).optional().describe('Result offset for pagination (default 0)'),
  }),
  output: z.object({
    tracks: z.array(searchTrackSchema).describe('Matching tracks'),
    artists: z.array(searchArtistSchema).describe('Matching artists'),
    albums: z.array(searchAlbumSchema).describe('Matching albums'),
    playlists: z.array(searchPlaylistSchema).describe('Matching playlists'),
  }),
  handle: async params => {
    const data = await graphql<RawSearchResponse>('searchDesktop', {
      searchTerm: params.query,
      offset: params.offset ?? 0,
      limit: params.limit ?? 10,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includeArtistHasConcertsField: false,
      includePreReleases: false,
      includeAuthors: false,
    });

    return mapSearchResults(data);
  },
});
