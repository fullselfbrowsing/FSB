import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';
import { type RawDevice, deviceSchema, mapDevice } from './schemas.js';

export const getAvailableDevices = defineTool({
  name: 'get_available_devices',
  displayName: 'Get Available Devices',
  description:
    'List all devices available for Spotify playback. Returns device names, types, active status, and volume levels. Use a device ID from the results with transfer_playback or other playback tools.',
  summary: 'List available Spotify playback devices',
  icon: 'speaker',
  group: 'Playback',
  input: z.object({}),
  output: z.object({
    devices: z.array(deviceSchema).describe('List of available playback devices'),
  }),
  handle: async () => {
    const data = await api<{ devices: RawDevice[] }>('/me/player/devices');
    return {
      devices: (data.devices ?? []).map(mapDevice),
    };
  },
});
