import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { mapWatchHistoryEntry, watchHistorySchema } from './schemas.js';

export const getWatchHistory = defineTool({
  name: 'get_watch_history',
  displayName: 'Get Watch History',
  description:
    'Get the recent viewing history for the current Netflix profile. Returns titles the user has watched or started watching, with watch progress information.',
  summary: 'Get recent viewing history',
  icon: 'history',
  group: 'Library',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 20, max 50)'),
  }),
  output: z.object({
    entries: z.array(watchHistorySchema).describe('Watch history entries'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;

    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const paths = [
      [
        'viewingActivity',
        { from: 0, to: limit - 1 },
        ['title', 'date', 'bookmark', 'runtime', 'series', 'seriesTitle', 'seasonDescriptor', 'episodeTitle'],
      ],
    ];

    const result = (await pe.get.bind(pe)(...paths)) as { json?: Record<string, unknown> };
    const data = result?.json ?? {};

    const historyData = (data as Record<string, Record<string, unknown>>)?.viewingActivity;
    if (!historyData) {
      return { entries: [] };
    }

    const entries: ReturnType<typeof mapWatchHistoryEntry>[] = [];
    for (const [key, entry] of Object.entries(historyData)) {
      if (key === 'length' || key === '$__path' || key === 'size') continue;
      const item = entry as Record<string, unknown>;
      const videoId = item?.videoId as number | undefined;

      // Try to enrich with cached data
      const titleVal = videoId ? ((readApolloTitle(videoId)?.title as string | undefined) ?? null) : null;

      entries.push(
        mapWatchHistoryEntry({
          videoId: videoId ?? 0,
          title: titleVal ?? (item?.title as string | undefined) ?? (item?.seriesTitle as string | undefined) ?? '',
          dateStr: (item?.date as string | undefined) ?? '',
          bookmark: item?.bookmark as { position?: number } | undefined,
          runtime: item?.runtime as number | undefined,
        }),
      );
    }

    return { entries };
  },
});
