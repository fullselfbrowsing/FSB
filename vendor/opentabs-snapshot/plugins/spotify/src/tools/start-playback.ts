import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const startPlayback = defineTool({
  name: 'start_playback',
  displayName: 'Start Playback',
  description:
    'Start or resume playback. Provide context_uri for an album, playlist, or artist, or uris for specific tracks.',
  summary: 'Start or resume playback',
  icon: 'play',
  group: 'Playback',
  input: z.object({
    context_uri: z.string().optional().describe('Spotify URI of the context to play (album, playlist, or artist URI)'),
    uris: z.array(z.string()).optional().describe('Array of Spotify track URIs to play'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Zero-based position of the track to start playback from within the context'),
    position_ms: z.number().int().optional().describe('Position in milliseconds to seek to within the track'),
    device_id: z.string().optional().describe('Device ID to start playback on'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether playback was started successfully'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.context_uri !== undefined) body.context_uri = params.context_uri;
    if (params.uris !== undefined) body.uris = params.uris;
    if (params.offset !== undefined) body.offset = { position: params.offset };
    if (params.position_ms !== undefined) body.position_ms = params.position_ms;

    await api('/me/player/play', {
      method: 'PUT',
      body: Object.keys(body).length > 0 ? body : undefined,
      query: { device_id: params.device_id },
    });
    return { success: true };
  },
});
