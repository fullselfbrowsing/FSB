import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const savePin = defineTool({
  name: 'save_pin',
  displayName: 'Save Pin',
  description:
    'Save (repin) an existing pin to one of your boards. This creates a copy of the pin on your board. Optionally specify a board section.',
  summary: 'Save an existing pin to a board',
  icon: 'bookmark',
  group: 'Pins',
  input: z.object({
    pin_id: z.string().describe('Pin ID to save'),
    board_id: z.string().describe('Board ID to save the pin to'),
    section_id: z.string().optional().describe('Board section ID to save the pin to'),
  }),
  output: z.object({
    pin: pinSchema.describe('The saved pin'),
  }),
  handle: async params => {
    const resp = await resourcePost<RawPin>(
      'RepinResource',
      'create',
      {
        pin_id: params.pin_id,
        board_id: params.board_id,
        section: params.section_id ?? null,
        is_buyable_pin: false,
      },
      `/pin/${params.pin_id}/`,
    );

    return { pin: mapPin(resp.resource_response.data) };
  },
});
