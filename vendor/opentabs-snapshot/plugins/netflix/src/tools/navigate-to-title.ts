import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToTitle = defineTool({
  name: 'navigate_to_title',
  displayName: 'Navigate to Title',
  description:
    'Navigate the browser to a Netflix title page. This opens the detail view for a movie or TV show where the user can see more info or start playback. Use search_titles or get_title to find the video ID first.',
  summary: 'Open a title page in the browser',
  icon: 'external-link',
  group: 'Browse',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID to navigate to'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation was initiated'),
    url: z.string().describe('The URL navigated to'),
  }),
  handle: async params => {
    const url = `https://www.netflix.com/title/${params.video_id}`;
    window.location.href = url;
    return { success: true, url };
  },
});
