import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const addToMyList = defineTool({
  name: 'add_to_my_list',
  displayName: 'Add to My List',
  description:
    'Add a movie or TV show to the current Netflix profile\'s "My List". Use search_titles or get_title to find the video ID first.',
  summary: 'Save a title to My List',
  icon: 'bookmark-plus',
  group: 'Library',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID to add'),
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

    await pe.call.bind(pe)(['lolomos', 'addToList'], [params.video_id], []);

    return { success: true };
  },
});
