import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const unlikeVideo = defineTool({
  name: 'unlike_video',
  displayName: 'Unlike Video',
  description: 'Remove a like from a YouTube video.',
  summary: 'Remove a like from a video',
  icon: 'thumbs-down',
  group: 'Videos',
  input: z.object({
    video_id: z.string().describe('YouTube video ID to unlike'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api('like/removelike', {
      target: { videoId: params.video_id },
    });
    return { success: true };
  },
});
