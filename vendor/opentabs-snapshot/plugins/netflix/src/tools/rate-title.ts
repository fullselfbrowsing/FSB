import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const rateTitle = defineTool({
  name: 'rate_title',
  displayName: 'Rate Title',
  description:
    'Rate a Netflix movie or TV show using the thumbs rating system. Netflix uses three rating levels: thumbs up, thumbs way up (love it), and thumbs down. Pass "THUMBS_UP", "THUMBS_WAY_UP", "THUMBS_DOWN", or "THUMBS_UNRATED" to clear a rating.',
  summary: 'Rate a movie or show',
  icon: 'thumbs-up',
  group: 'Library',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID to rate'),
    rating: z
      .enum(['THUMBS_UP', 'THUMBS_WAY_UP', 'THUMBS_DOWN', 'THUMBS_UNRATED'])
      .describe('Rating: THUMBS_UP, THUMBS_WAY_UP, THUMBS_DOWN, or THUMBS_UNRATED to clear'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      call?: (...args: unknown[]) => Promise<unknown>;
    } | null;

    if (!pe?.call) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const ratingMap: Record<string, number> = {
      THUMBS_DOWN: 1,
      THUMBS_UP: 2,
      THUMBS_WAY_UP: 3,
      THUMBS_UNRATED: 0,
    };
    const ratingValue = ratingMap[params.rating] ?? 0;

    await pe.call.bind(pe)(['videos', params.video_id, 'rating', 'rate'], [ratingValue], []);

    return { success: true };
  },
});
