import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawAlert, alertSchema, mapAlert } from './schemas.js';

export const listAlerts = defineTool({
  name: 'list_alerts',
  displayName: 'List Alerts',
  description: 'List account alerts from the Twilio Monitor. Optionally filter by log level.',
  summary: 'List Alerts',
  icon: 'alert-triangle',
  group: 'Alerts',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of alerts to return per page (default 20, max 1000)'),
    log_level: z.enum(['warning', 'error']).optional().describe('Filter by log level (warning or error)'),
  }),
  output: z.object({
    alerts: z.array(alertSchema).describe('Array of alerts'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };
    if (params.log_level) query.LogLevel = params.log_level;

    const data = await subApi<{ alerts: RawAlert[] }>('https://monitor.twilio.com/v1', '/Alerts', { query });
    return { alerts: (data.alerts ?? []).map(mapAlert) };
  },
});
