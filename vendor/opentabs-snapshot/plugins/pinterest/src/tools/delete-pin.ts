import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';

export const deletePin = defineTool({
  name: 'delete_pin',
  displayName: 'Delete Pin',
  description: 'Delete a pin by its ID. Only works for pins you own. This action cannot be undone.',
  summary: 'Delete a pin',
  icon: 'trash-2',
  group: 'Pins',
  input: z.object({
    pin_id: z.string().describe('Pin ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await resourcePost('PinResource', 'delete', {
      id: params.pin_id,
    });

    return { success: true };
  },
});
