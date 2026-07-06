import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const addToPlaylist = defineTool({
  name: 'add_to_playlist',
  displayName: 'Add to Playlist',
  description: 'Add a video to a playlist. Use "WL" as the playlist_id to add to Watch Later.',
  summary: 'Add a video to a playlist',
  icon: 'list-plus',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('Playlist ID to add the video to (use "WL" for Watch Later)'),
    video_id: z.string().describe('YouTube video ID to add'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
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
