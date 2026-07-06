import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../spotify-api.js';
import { type RawAlbumResponse, albumSchema, mapAlbum } from './schemas.js';

export const getAlbum = defineTool({
  name: 'get_album',
  displayName: 'Get Album',
  description:
    'Get detailed information about a Spotify album including tracks, artists, release date, label, and copyrights. Provide the album Spotify URI (e.g., spotify:album:4aawyAB9vmqN3uQ7FjRGTy). Tracks are included in the response.',
  summary: 'Get album details with tracks',
  icon: 'disc',
  group: 'Albums',
  input: z.object({
    uri: z.string().describe('Spotify album URI (e.g., "spotify:album:4aawyAB9vmqN3uQ7FjRGTy")'),
    offset: z.number().int().min(0).optional().describe('Track offset for pagination (default 0)'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum tracks to return (default 50)'),
  }),
  output: z.object({
    album: albumSchema.describe('Album details with tracks'),
  }),
  handle: async params => {
    const data = await graphql<RawAlbumResponse>('getAlbum', {
      uri: params.uri,
      locale: '',
      offset: params.offset ?? 0,
      limit: params.limit ?? 50,
    });
    return { album: mapAlbum(data) };
  },
});
