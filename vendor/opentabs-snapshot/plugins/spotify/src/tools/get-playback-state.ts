import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';
import { type RawPlaybackState, mapPlaybackState, playbackStateSchema } from './schemas.js';

export const getPlaybackState = defineTool({
  name: 'get_playback_state',
  displayName: 'Get Playback State',
  description:
    'Get the current playback state including device, shuffle, repeat mode, progress, and the currently playing track.',
  summary: 'Get current playback state',
  icon: 'play-circle',
  group: 'Playback',
  input: z.object({}),
  output: z.object({
    state: playbackStateSchema.describe('Current playback state'),
    active: z.boolean().describe('Whether there is an active device'),
  }),
  handle: async () => {
    const data = await api<RawPlaybackState>('/me/player');
    const isEmpty = Object.keys(data).length === 0;
    return {
      state: mapPlaybackState(isEmpty ? {} : data),
      active: !isEmpty,
    };
  },
});
