import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';

export const delete_playlist = defineTool({
  name: 'delete_playlist',
  displayName: 'Delete Playlist',
  description: 'Delete a playlist from YouTube Music',
  summary: 'Delete a playlist',
  icon: 'trash-2',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('ID of the playlist to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  async handle(params) {
    await api('playlist/delete', {
      playlistId: params.playlist_id,
    });
    return { success: true };
  },
});
