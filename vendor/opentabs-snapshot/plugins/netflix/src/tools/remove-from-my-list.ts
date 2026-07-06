import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const removeFromMyList = defineTool({
  name: 'remove_from_my_list',
  displayName: 'Remove from My List',
  description:
    'Remove a movie or TV show from the current Netflix profile\'s "My List". Use list_my_list to see what is currently in the list.',
  summary: 'Remove a title from My List',
  icon: 'bookmark-minus',
  group: 'Library',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID to remove'),
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

    await pe.call.bind(pe)(['lolomos', 'removeFromList'], [params.video_id], []);

    return { success: true };
  },
});
