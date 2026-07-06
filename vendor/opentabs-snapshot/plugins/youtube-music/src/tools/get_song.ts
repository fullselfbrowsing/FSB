import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { songDetailsSchema, mapSongDetails } from './schemas.js';
import type { PlayerResponse } from './schemas.js';

type RawVideoDetails = Parameters<typeof mapSongDetails>[0];

export const get_song = defineTool({
  name: 'get_song',
  displayName: 'Get Song',
  description: 'Get detailed information about a song by its video ID',
  summary: 'Get detailed information about a song',
  icon: 'music',
  group: 'Songs',
  input: z.object({
    video_id: z.string().describe('YouTube video ID of the song'),
  }),
  output: z.object({
    song: songDetailsSchema.describe('Detailed song information'),
  }),
  async handle(params) {
    const data = await api<PlayerResponse>('player', {
      videoId: params.video_id,
    });

    return { song: mapSongDetails(data.videoDetails ?? ({} as RawVideoDetails)) };
  },
});
