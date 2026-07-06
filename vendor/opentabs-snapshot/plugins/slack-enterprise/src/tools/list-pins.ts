import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapPin, pinSchema } from './schemas.js';

export const listPins = defineTool({
  name: 'list_pins',
  displayName: 'List Pins',
  description: 'List all pinned items in a Slack channel including messages and files.',
  summary: 'List pinned items',
  icon: 'pin',
  group: 'Pins',
  input: z.object({
    channel: z.string().describe('Channel ID to list pins from (e.g., C1234567890)'),
  }),
  output: z.object({
    pins: z.array(pinSchema),
  }),
  handle: async params => {
    const data = await slackApi<{ items: Array<Record<string, unknown>> }>('pins.list', {
      channel: params.channel,
    });
    return { pins: (data.items ?? []).map(mapPin) };
  },
});
