import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawSetting } from './schemas.js';
import { settingSchema, mapSetting } from './schemas.js';

export const listSettings = defineTool({
  name: 'list_settings',
  displayName: 'List Settings',
  description:
    'List all user settings for the authenticated user. Returns settings like timezone, locale, date format, week start day, etc.',
  summary: 'List all user calendar settings',
  icon: 'sliders-horizontal',
  group: 'Settings',
  input: z.object({}),
  output: z.object({
    settings: z.array(settingSchema).describe('List of user settings'),
  }),
  handle: async () => {
    const data = await api<{ items?: RawSetting[] }>('/users/me/settings');
    return { settings: (data.items ?? []).map(mapSetting) };
  },
});
