import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';

export const add_to_playlist = defineTool({
  name: 'add_to_playlist',
  displayName: 'Add to Playlist',
  description: 'Add a song to a playlist on YouTube Music',
  summary: 'Add a song to a playlist',
  icon: 'plus',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('ID of the playlist to add the song to'),
    video_id: z.string().describe('YouTube video ID of the song to add'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the song was added successfully'),
  }),
  async handle(params) {
    await api('browse/edit_playlist', {
      playlistId: params.playlist_id,
      actions: [
        {
          addedVideoId: params.video_id,
          action: 'ACTION_ADD_VIDEO',
        },
      ],
    });
    return { success: true };
  },
});
