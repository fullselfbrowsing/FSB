import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToGenre = defineTool({
  name: 'navigate_to_genre',
  displayName: 'Navigate to Genre',
  description:
    'Navigate the browser to a Netflix genre browse page. Common genre IDs: 83 (TV Shows), 34399 (Movies), 1365 (Action), 5763 (Drama), 6548 (Comedy), 8933 (Thriller), 7424 (Anime), 2243108 (Korean TV), 26065 (Sci-Fi), 8711 (Horror), 10118 (Comic & Superhero), 13335 (Reality TV), 11559 (Stand-Up Comedy), 6839 (Documentaries).',
  summary: 'Open a genre page in the browser',
  icon: 'compass',
  group: 'Browse',
  input: z.object({
    genre_id: z.number().int().describe('Netflix genre ID (e.g., 1365 for Action, 6548 for Comedy)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation was initiated'),
    url: z.string().describe('The URL navigated to'),
  }),
  handle: async params => {
    const url = `https://www.netflix.com/browse/genre/${params.genre_id}`;
    window.location.href = url;
    return { success: true, url };
  },
});
