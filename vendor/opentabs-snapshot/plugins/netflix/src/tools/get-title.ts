import { ToolError, getPageGlobal, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { apolloEntryToRawTitle, mapTitle, titleSchema } from './schemas.js';

export const getTitle = defineTool({
  name: 'get_title',
  displayName: 'Get Title',
  description:
    'Get detailed information about a Netflix movie or TV show by its video ID. Returns title metadata including synopsis, rating, watch status, and whether it is in My List. Use search_titles to find video IDs.',
  summary: 'Get details for a movie or show',
  icon: 'film',
  group: 'Browse',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID'),
  }),
  output: z.object({ title: titleSchema }),
  handle: async params => {
    // Try the Apollo Client cache first
    const cached = readApolloTitle(params.video_id);
    if (cached) {
      return { title: mapTitle(apolloEntryToRawTitle(cached)) };
    }

    // Fall back to pathEvaluator to load the data
    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<unknown>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    await pe.get.bind(pe)([
      'videos',
      params.video_id,
      ['title', 'summary', 'queue', 'inRemindMeList', 'runtime', 'bookmarkPosition', 'current'],
    ]);

    // Re-check Apollo cache after pathEvaluator populates it
    const afterFetch = readApolloTitle(params.video_id);
    if (afterFetch) {
      return { title: mapTitle(apolloEntryToRawTitle(afterFetch)) };
    }

    throw ToolError.notFound(`Title with video ID ${params.video_id} not found.`);
  },
});
