import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { type RawTitle, mapTitle, titleSchema } from './schemas.js';

export const listContinueWatching = defineTool({
  name: 'list_continue_watching',
  displayName: 'List Continue Watching',
  description:
    'Get titles the user has started but not finished watching. Returns movies and shows with their bookmark positions. Useful for resuming playback or seeing what the user was recently watching.',
  summary: 'Get in-progress titles',
  icon: 'play-circle',
  group: 'Library',
  input: z.object({
    limit: z.number().int().min(1).max(40).optional().describe('Max results to return (default 20, max 40)'),
  }),
  output: z.object({
    titles: z.array(titleSchema).describe('Continue watching titles'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;

    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const paths = [['continueWatching', { from: 0, to: limit - 1 }, ['summary', 'title']]];

    const result = (await pe.get.bind(pe)(...paths)) as { json?: Record<string, unknown> };
    const data = result?.json ?? {};

    const cwData = (data as Record<string, Record<string, unknown>>)?.continueWatching;
    if (!cwData) {
      return { titles: [] };
    }

    const titles: ReturnType<typeof mapTitle>[] = [];
    for (const [key, entry] of Object.entries(cwData)) {
      if (key === 'length' || key === '$__path') continue;
      const videoEntry = entry as Record<string, unknown>;
      const summaryVal = videoEntry?.summary as Record<string, unknown> | undefined;
      const videoId = (summaryVal?.id as number | undefined) ?? 0;
      if (!videoId) continue;

      const titleVal = (readApolloTitle(videoId)?.title as string | undefined) ?? '';
      titles.push(
        mapTitle({
          videoId,
          title: titleVal || (videoEntry?.title as string | undefined) || '',
          summary: summaryVal as RawTitle['summary'],
          watchStatus: 'STARTED',
        } as RawTitle),
      );
    }

    return { titles };
  },
});
