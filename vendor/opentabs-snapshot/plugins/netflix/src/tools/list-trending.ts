import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { type RawTitle, mapTitle, titleSchema } from './schemas.js';

export const listTrending = defineTool({
  name: 'list_trending',
  displayName: 'List Trending',
  description:
    'Get currently trending titles on Netflix. Returns popular movies and shows that are trending in the user\'s region. This reads the "Trending Now" row from the Netflix homepage.',
  summary: 'Get trending titles on Netflix',
  icon: 'trending-up',
  group: 'Browse',
  input: z.object({
    limit: z.number().int().min(1).max(40).optional().describe('Max results to return (default 20, max 40)'),
  }),
  output: z.object({
    titles: z.array(titleSchema).describe('Trending titles'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;

    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const paths = [['trendingNow', { from: 0, to: limit - 1 }, ['summary', 'title']]];

    const result = (await pe.get.bind(pe)(...paths)) as { json?: Record<string, unknown> };
    const data = result?.json ?? {};

    const trendingData = (data as Record<string, Record<string, unknown>>)?.trendingNow;
    if (!trendingData) {
      return { titles: [] };
    }

    const titles: ReturnType<typeof mapTitle>[] = [];
    for (const [key, entry] of Object.entries(trendingData)) {
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
        } as RawTitle),
      );
    }

    return { titles };
  },
});
