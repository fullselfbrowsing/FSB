import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawAlert, alertSchema, mapAlert } from './schemas.js';

export const getAlert = defineTool({
  name: 'get_alert',
  displayName: 'Get Alert',
  description: 'Get a specific alert by its SID from Twilio Monitor.',
  summary: 'Get Alert',
  icon: 'alert-triangle',
  group: 'Alerts',
  input: z.object({
    sid: z.string().describe('Alert SID'),
  }),
  output: alertSchema,
  handle: async params => {
    const data = await subApi<RawAlert>('https://monitor.twilio.com/v1', `/Alerts/${params.sid}`);
    return mapAlert(data);
  },
});
