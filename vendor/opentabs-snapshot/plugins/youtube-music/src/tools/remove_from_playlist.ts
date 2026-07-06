import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';

export const remove_from_playlist = defineTool({
  name: 'remove_from_playlist',
  displayName: 'Remove from Playlist',
  description: 'Remove a song from a playlist on YouTube Music',
  summary: 'Remove a song from a playlist',
  icon: 'minus',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('ID of the playlist to remove the song from'),
    video_id: z.string().describe('YouTube video ID of the song to remove'),
    set_video_id: z.string().describe('Set video ID from playlist track data, identifies the specific playlist entry'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the song was removed successfully'),
  }),
  async handle(params) {
    await api('browse/edit_playlist', {
      playlistId: params.playlist_id,
      actions: [
        {
          setVideoId: params.set_video_id,
          removedVideoId: params.video_id,
          action: 'ACTION_REMOVE_VIDEO',
        },
      ],
    });
    return { success: true };
  },
});
