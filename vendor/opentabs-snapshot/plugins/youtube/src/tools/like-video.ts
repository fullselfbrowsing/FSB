import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const likeVideo = defineTool({
  name: 'like_video',
  displayName: 'Like Video',
  description: 'Like a YouTube video. The video will be added to the "Liked videos" playlist.',
  summary: 'Like a video',
  icon: 'thumbs-up',
  group: 'Videos',
  input: z.object({
    video_id: z.string().describe('YouTube video ID to like'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api('like/like', {
      target: { videoId: params.video_id },
    });
    return { success: true };
  },
});
