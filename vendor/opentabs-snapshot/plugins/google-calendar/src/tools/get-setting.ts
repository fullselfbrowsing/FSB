import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawSetting } from './schemas.js';
import { settingSchema, mapSetting } from './schemas.js';

export const getSetting = defineTool({
  name: 'get_setting',
  displayName: 'Get Setting',
  description:
    'Get a specific user setting by ID. Common settings: "timezone", "locale", "dateFieldOrder", "format24HourTime", "weekStart", "showDeclinedEvents", "autoAddHangouts".',
  summary: 'Get a specific user setting',
  icon: 'settings-2',
  group: 'Settings',
  input: z.object({
    setting_id: z.string().describe('Setting ID (e.g., "timezone", "locale", "weekStart")'),
  }),
  output: z.object({ setting: settingSchema }),
  handle: async params => {
    const data = await api<RawSetting>(`/users/me/settings/${encodeURIComponent(params.setting_id)}`);
    return { setting: mapSetting(data) };
  },
});
