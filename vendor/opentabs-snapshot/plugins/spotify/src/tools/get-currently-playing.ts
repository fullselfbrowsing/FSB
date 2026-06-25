import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';
import { type RawPublicTrack, mapPublicTrack, publicTrackSchema } from './schemas.js';

interface RawCurrentlyPlaying {
  item?: RawPublicTrack;
  is_playing?: boolean;
  progress_ms?: number | null;
}

export const getCurrentlyPlaying = defineTool({
  name: 'get_currently_playing',
  displayName: 'Get Currently Playing',
  description: 'Get the track that is currently playing on the user\u2019s active device.',
  summary: 'Get the currently playing track',
  icon: 'music',
  group: 'Playback',
  input: z.object({}),
  output: z.object({
    track: publicTrackSchema.describe('Currently playing track'),
    is_playing: z.boolean().describe('Whether audio is currently playing'),
    progress_ms: z.number().int().describe('Playback progress in milliseconds'),
  }),
  handle: async () => {
    const data = await api<RawCurrentlyPlaying>('/me/player/currently-playing');
    const isEmpty = Object.keys(data).length === 0;
    return {
      track: mapPublicTrack(isEmpty ? {} : (data.item ?? {})),
      is_playing: isEmpty ? false : (data.is_playing ?? false),
      progress_ms: isEmpty ? 0 : (data.progress_ms ?? 0),
    };
  },
});
