import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../spotify-api.js';
import { type RawArtistOverview, artistSchema, mapArtistOverview } from './schemas.js';

export const getArtist = defineTool({
  name: 'get_artist',
  displayName: 'Get Artist',
  description:
    "Get detailed information about a Spotify artist including name, biography, followers, monthly listeners, and top tracks. Provide the artist's Spotify URI (e.g., spotify:artist:0OdUWJ0sBjDrqHygGUXeCF).",
  summary: 'Get artist details and top tracks',
  icon: 'mic',
  group: 'Artists',
  input: z.object({
    uri: z.string().describe('Spotify artist URI (e.g., "spotify:artist:0OdUWJ0sBjDrqHygGUXeCF")'),
  }),
  output: z.object({
    artist: artistSchema.describe('Artist details with top tracks'),
  }),
  handle: async params => {
    const data = await graphql<RawArtistOverview>('queryArtistOverview', {
      uri: params.uri,
      locale: '',
    });
    return { artist: mapArtistOverview(data) };
  },
});
