import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';

export const like_song = defineTool({
  name: 'like_song',
  displayName: 'Like Song',
  description: 'Like a song on YouTube Music',
  summary: 'Like a song on YouTube Music',
  icon: 'thumbs-up',
  group: 'Songs',
  input: z.object({
    video_id: z.string().describe('YouTube video ID of the song to like'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the like was successful'),
  }),
  async handle(params) {
    await api('like/like', {
      target: { videoId: params.video_id },
    });
    return { success: true };
  },
});
