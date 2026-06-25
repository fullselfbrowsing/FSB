import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const createPin = defineTool({
  name: 'create_pin',
  displayName: 'Create Pin',
  description:
    'Create a new pin from an image URL and save it to a board. Requires the board ID, an image URL, and optionally a title, description, and external link.',
  summary: 'Create a new pin on a board',
  icon: 'plus',
  group: 'Pins',
  input: z.object({
    board_id: z.string().describe('Board ID to save the pin to'),
    image_url: z.string().describe('URL of the image to pin'),
    title: z.string().optional().describe('Pin title'),
    description: z.string().optional().describe('Pin description'),
    link: z.string().optional().describe('External link URL'),
    section_id: z.string().optional().describe('Board section ID to save the pin to'),
  }),
  output: z.object({
    pin: pinSchema.describe('The newly created pin'),
  }),
  handle: async params => {
    const resp = await resourcePost<RawPin>('PinResource', 'create', {
      board_id: params.board_id,
      image_url: params.image_url,
      title: params.title ?? '',
      description: params.description ?? '',
      link: params.link ?? '',
      section: params.section_id ?? null,
      method: 'scraped',
    });

    return { pin: mapPin(resp.resource_response.data) };
  },
});
