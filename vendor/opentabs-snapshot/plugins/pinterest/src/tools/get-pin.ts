import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const getPin = defineTool({
  name: 'get_pin',
  displayName: 'Get Pin',
  description:
    'Get detailed information about a specific pin by its ID. Returns title, description, image, link, repin count, comment count, and creator info.',
  summary: 'Get pin details by ID',
  icon: 'image',
  group: 'Pins',
  input: z.object({
    pin_id: z.string().describe('Pin ID'),
  }),
  output: z.object({
    pin: pinSchema.describe('The pin details'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawPin>(
      'PinResource',
      {
        id: params.pin_id,
        field_set_key: 'detailed',
      },
      `/pin/${params.pin_id}/`,
    );

    return { pin: mapPin(resp.resource_response.data) };
  },
});
