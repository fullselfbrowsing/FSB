import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type RawEpisode, type RawSeason, episodeSchema, mapEpisode, mapSeason, seasonSchema } from './schemas.js';

export const getSeasons = defineTool({
  name: 'get_seasons',
  displayName: 'Get Seasons',
  description:
    'Get the season and episode list for a Netflix TV show. Returns all seasons with their episodes, including episode titles, runtimes, and watch progress. Only works for TV shows (not movies).',
  summary: 'Get seasons and episodes for a show',
  icon: 'list-video',
  group: 'Browse',
  input: z.object({
    video_id: z.number().int().describe('Netflix video ID of the TV show'),
  }),
  output: z.object({
    seasons: z.array(
      seasonSchema.extend({
        episodes: z.array(episodeSchema).describe('Episodes in this season'),
      }),
    ),
  }),
  handle: async params => {
    const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
      get?: (...args: unknown[]) => Promise<{ json?: Record<string, unknown> }>;
    } | null;

    if (!pe?.get) {
      throw ToolError.internal('Netflix pathEvaluator not available on page.');
    }

    // First get the season list for this show
    const seasonPaths = [
      ['videos', params.video_id, 'seasonList', { from: 0, to: 19 }, 'summary'],
      ['videos', params.video_id, 'seasonList', 'summary'],
    ];

    const seasonResult = (await pe.get.bind(pe)(...seasonPaths)) as { json?: Record<string, unknown> };
    const seasonData = seasonResult?.json ?? {};

    const videoData = (seasonData as Record<string, Record<string, Record<string, unknown>>>)?.videos?.[
      String(params.video_id)
    ];
    const seasonListData = videoData?.seasonList as Record<string, unknown> | undefined;

    if (!seasonListData) {
      return { seasons: [] };
    }

    // Collect season IDs
    const seasonIds: number[] = [];
    for (const [key, entry] of Object.entries(seasonListData)) {
      if (key === 'summary' || key === '$__path' || key === 'length') continue;
      const seasonEntry = entry as Record<string, unknown>;
      const summary = seasonEntry?.summary as Record<string, unknown> | undefined;
      const id = summary?.id as number | undefined;
      if (id) seasonIds.push(id);
    }

    if (seasonIds.length === 0) {
      return { seasons: [] };
    }

    // Fetch episodes for each season
    const episodePaths = seasonIds.flatMap(seasonId => [
      ['seasons', seasonId, 'episodes', { from: 0, to: 49 }, ['summary', 'title', 'runtime', 'bookmark']],
      ['seasons', seasonId, 'episodes', 'summary'],
      ['seasons', seasonId, 'summary'],
    ]);

    const episodeResult = (await pe.get.bind(pe)(...episodePaths)) as { json?: Record<string, unknown> };
    const episodeData = episodeResult?.json ?? {};

    const seasonsObj = (episodeData as Record<string, Record<string, unknown>>)?.seasons;
    const seasons: Array<ReturnType<typeof mapSeason> & { episodes: ReturnType<typeof mapEpisode>[] }> = [];

    for (let i = 0; i < seasonIds.length; i++) {
      const seasonId = seasonIds[i];
      if (seasonId === undefined) continue;
      const sData = seasonsObj?.[String(seasonId)] as Record<string, unknown> | undefined;
      if (!sData) continue;

      const sSummary = sData.summary as Record<string, unknown> | undefined;
      const season = mapSeason({
        videoId: seasonId,
        seasonNumber: (sSummary?.seasonNumber as number | undefined) ?? i + 1,
        title: (sSummary?.name as string | undefined) ?? `Season ${i + 1}`,
      } as RawSeason);

      const episodesObj = sData.episodes as Record<string, unknown> | undefined;
      const episodes: ReturnType<typeof mapEpisode>[] = [];

      if (episodesObj) {
        for (const [eKey, eEntry] of Object.entries(episodesObj)) {
          if (eKey === 'summary' || eKey === '$__path' || eKey === 'length') continue;
          const ep = eEntry as Record<string, unknown>;
          const epSummary = ep?.summary as Record<string, unknown> | undefined;
          episodes.push(
            mapEpisode(
              {
                videoId: epSummary?.id as number | undefined,
                title: (ep?.title as string | undefined) ?? '',
                number: epSummary?.episode as number | undefined,
                runtimeSec: ep?.runtime as number | undefined,
                bookmark: ep?.bookmark as RawEpisode['bookmark'],
              } as RawEpisode,
              season.season_number,
            ),
          );
        }
      }

      seasons.push({ ...season, episodes });
    }

    return { seasons };
  },
});
