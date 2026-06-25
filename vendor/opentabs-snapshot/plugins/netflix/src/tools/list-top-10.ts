import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { type RawTitle, mapTitle, titleSchema } from './schemas.js';

export const listTop10 = defineTool({
  name: 'list_top_10',
  displayName: 'List Top 10',
  description:
    'Get the Netflix Top 10 list for the user\'s region. Returns the most-watched titles currently ranking on Netflix. Optionally filter by "tv" or "movie".',
  summary: 'Get Netflix Top 10 titles',
  icon: 'trophy',
  group: 'Browse',
  input: z.object({
    type: z
      .enum(['all', 'tv', 'movie'])
      .optional()
      .describe('Filter by content type: "all" (default), "tv", or "movie"'),
  }),
  output: z.object({
    titles: z.array(
      titleSchema.extend({
        rank: z.number().int().describe('Current rank (1-10)'),
      }),
    ),
  }),
  handle: async params => {
    const filterType = params.type ?? 'all';

    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const paths = [['topN', { from: 0, to: 9 }, ['summary', 'title']]];

    const result = (await pe.get.bind(pe)(...paths)) as { json?: Record<string, unknown> };
    const data = result?.json ?? {};

    const topNData = (data as Record<string, Record<string, unknown>>)?.topN;
    if (!topNData) {
      return { titles: [] };
    }

    const titles: Array<ReturnType<typeof mapTitle> & { rank: number }> = [];
    let rank = 1;
    for (const [key, entry] of Object.entries(topNData)) {
      if (key === 'length' || key === '$__path') continue;
      const videoEntry = entry as Record<string, unknown>;
      const summaryVal = videoEntry?.summary as Record<string, unknown> | undefined;
      const videoId = (summaryVal?.id as number | undefined) ?? 0;
      if (!videoId) continue;

      const videoType = (summaryVal?.type as string | undefined) ?? '';
      if (filterType === 'tv' && videoType !== 'show') continue;
      if (filterType === 'movie' && videoType !== 'movie') continue;

      const titleVal = (readApolloTitle(videoId)?.title as string | undefined) ?? '';
      titles.push({
        ...mapTitle({
          videoId,
          title: titleVal || (videoEntry?.title as string | undefined) || '',
          summary: summaryVal as RawTitle['summary'],
        } as RawTitle),
        rank: rank++,
      });
    }

    return { titles };
  },
});
