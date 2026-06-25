import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';

export const unlike_song = defineTool({
  name: 'unlike_song',
  displayName: 'Unlike Song',
  description: 'Remove a like from a song on YouTube Music',
  summary: 'Remove like from a song',
  icon: 'thumbs-down',
  group: 'Songs',
  input: z.object({
    video_id: z.string().describe('YouTube video ID of the song to unlike'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unlike was successful'),
  }),
  async handle(params) {
    await api('like/removelike', {
      target: { videoId: params.video_id },
    });
    return { success: true };
  },
});
