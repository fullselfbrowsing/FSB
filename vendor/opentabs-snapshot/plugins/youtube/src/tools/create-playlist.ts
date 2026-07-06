import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import type { CreatePlaylistResponse } from './schemas.js';

export const createPlaylist = defineTool({
  name: 'create_playlist',
  displayName: 'Create Playlist',
  description: 'Create a new YouTube playlist. Returns the playlist ID of the newly created playlist.',
  summary: 'Create a new playlist',
  icon: 'list-plus',
  group: 'Playlists',
  input: z.object({
    title: z.string().describe('Playlist title'),
    privacy: z.enum(['PRIVATE', 'PUBLIC', 'UNLISTED']).optional().describe('Privacy status (default PRIVATE)'),
  }),
  output: z.object({
    playlist_id: z.string().describe('ID of the newly created playlist'),
  }),
  handle: async params => {
    const data = await api<CreatePlaylistResponse>('playlist/create', {
      title: params.title,
      privacyStatus: params.privacy ?? 'PRIVATE',
    });

    return {
      playlist_id: data.playlistId ?? '',
    };
  },
});
