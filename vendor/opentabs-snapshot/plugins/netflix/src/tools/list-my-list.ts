import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { type RawTitle, mapTitle, titleSchema } from './schemas.js';

export const listMyList = defineTool({
  name: 'list_my_list',
  displayName: 'List My List',
  description:
    'Get all titles in the current Netflix profile\'s "My List" (saved titles). Returns movies and shows the user has added to their list.',
  summary: 'Get titles in My List',
  icon: 'bookmark',
  group: 'Library',
  input: z.object({
    limit: z.number().int().min(1).max(75).optional().describe('Max results to return (default 40, max 75)'),
  }),
  output: z.object({
    titles: z.array(titleSchema).describe('Titles in My List'),
  }),
  handle: async params => {
    const limit = params.limit ?? 40;

    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const paths = [
      ['mylist', { from: 0, to: limit - 1 }, ['summary', 'title']],
      ['mylist', 'length'],
    ];

    const result = (await pe.get.bind(pe)(...paths)) as { json?: Record<string, unknown> };
    const data = result?.json ?? {};

    const myListData = (data as Record<string, Record<string, unknown>>)?.mylist;
    if (!myListData) {
      return { titles: [] };
    }

    const titles: ReturnType<typeof mapTitle>[] = [];
    for (const [key, entry] of Object.entries(myListData)) {
      if (key === 'length' || key === '$__path' || key === 'size') continue;
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
          isInPlaylist: true,
        } as RawTitle),
      );
    }

    return { titles };
  },
});
