import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../spotify-api.js';
import { type RawLibraryTracksResponse, mapLibraryTracks, savedTrackSchema } from './schemas.js';

export const getSavedTracks = defineTool({
  name: 'get_saved_tracks',
  displayName: 'Get Saved Tracks',
  description: "Get tracks saved in the current user's library. Returns saved tracks with the date they were added.",
  summary: 'Get saved tracks from library',
  icon: 'heart',
  group: 'Library',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of tracks to return (default 20, max 50)'),
    offset: z.number().int().min(0).optional().describe('Index of the first track to return (default 0)'),
  }),
  output: z.object({
    items: z.array(savedTrackSchema).describe('List of saved tracks'),
    total: z.number().int().describe('Total number of saved tracks'),
  }),
  handle: async params => {
    const data = await graphql<RawLibraryTracksResponse>('fetchLibraryTracks', {
      offset: params.offset ?? 0,
      limit: params.limit ?? 20,
    });
    return mapLibraryTracks(data);
  },
});
