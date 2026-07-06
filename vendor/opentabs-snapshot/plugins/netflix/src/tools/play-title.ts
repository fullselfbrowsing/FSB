import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const playTitle = defineTool({
  name: 'play_title',
  displayName: 'Play Title',
  description:
    'Start playing a Netflix movie or TV show in the browser. Navigates directly to the Netflix player for the given video ID. For TV shows, pass the specific episode video ID to play that episode.',
  summary: 'Start playing a title',
  icon: 'play',
  group: 'Playback',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID to play (movie or episode)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether playback navigation was initiated'),
    url: z.string().describe('The player URL navigated to'),
  }),
  handle: async params => {
    const url = `https://www.netflix.com/watch/${params.video_id}`;
    window.location.href = url;
    return { success: true, url };
  },
});
