import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawColorDefinition } from './schemas.js';
import { colorEntrySchema, mapColorEntry } from './schemas.js';

export const getColors = defineTool({
  name: 'get_colors',
  displayName: 'Get Colors',
  description:
    'Get the color definitions available for calendars and events. Returns color IDs with their background and foreground hex codes. Use these IDs when setting colors on events or calendars.',
  summary: 'Get available color definitions',
  icon: 'palette',
  group: 'Settings',
  input: z.object({}),
  output: z.object({
    calendar_colors: z.array(colorEntrySchema).describe('Available calendar colors'),
    event_colors: z.array(colorEntrySchema).describe('Available event colors'),
  }),
  handle: async () => {
    const data = await api<{
      calendar?: Record<string, RawColorDefinition>;
      event?: Record<string, RawColorDefinition>;
    }>('/colors');

    return {
      calendar_colors: Object.entries(data.calendar ?? {}).map(([id, c]) => mapColorEntry(id, c)),
      event_colors: Object.entries(data.event ?? {}).map(([id, c]) => mapColorEntry(id, c)),
    };
  },
});
