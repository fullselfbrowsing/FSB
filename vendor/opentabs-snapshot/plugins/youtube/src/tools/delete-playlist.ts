import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const deletePlaylist = defineTool({
  name: 'delete_playlist',
  displayName: 'Delete Playlist',
  description:
    'Delete a YouTube playlist. This action cannot be undone. Does not work for system playlists like Watch Later (WL) or Liked Videos (LL).',
  summary: 'Delete a playlist',
  icon: 'list-x',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('Playlist ID to delete (not WL or LL)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api('playlist/delete', {
      playlistId: params.playlist_id,
    });
    return { success: true };
  },
});
