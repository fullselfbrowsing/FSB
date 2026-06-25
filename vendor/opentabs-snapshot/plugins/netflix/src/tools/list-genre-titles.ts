import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readApolloTitle } from '../netflix-api.js';
import { type RawTitle, mapTitle, titleSchema } from './schemas.js';

export const listGenreTitles = defineTool({
  name: 'list_genre_titles',
  displayName: 'List Genre Titles',
  description:
    'Browse Netflix titles by genre ID. Common genre IDs: 83 (TV Shows), 34399 (Movies), 1365 (Action), 5763 (Drama), 6548 (Comedy), 8933 (Thriller), 7424 (Anime), 2243108 (Korean TV), 26065 (Sci-Fi), 8711 (Horror), 10118 (Comic & Superhero), 13335 (Reality TV), 11559 (Stand-Up Comedy), 6839 (Documentaries). Navigate to netflix.com/browse/genre/<id> to discover more genre IDs.',
  summary: 'Browse titles in a genre category',
  icon: 'layout-grid',
  group: 'Browse',
  input: z.object({
    genre_id: z.number().int().describe('Netflix genre ID (e.g., 1365 for Action, 6548 for Comedy)'),
    limit: z.number().int().min(1).max(40).optional().describe('Max results to return (default 20, max 40)'),
  }),
  output: z.object({
    titles: z.array(titleSchema).describe('Titles in the genre'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;

    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    const paths = [['genres', params.genre_id, 'su', { from: 0, to: limit - 1 }, ['summary', 'title']]];

    const result = (await pe.get.bind(pe)(...paths)) as { json?: Record<string, unknown> };
    const data = result?.json ?? {};

    const genreData = (data as Record<string, Record<string, Record<string, unknown>>>)?.genres?.[
      String(params.genre_id)
    ]?.su;

    if (!genreData) {
      return { titles: [] };
    }

    const titles: ReturnType<typeof mapTitle>[] = [];
    for (const [key, entry] of Object.entries(genreData)) {
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
