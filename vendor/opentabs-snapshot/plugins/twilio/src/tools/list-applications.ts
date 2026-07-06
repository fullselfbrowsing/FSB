import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawApplication, applicationSchema, mapApplication } from './schemas.js';

export const listApplications = defineTool({
  name: 'list_applications',
  displayName: 'List Applications',
  description: 'List TwiML applications. Optionally search by friendly name.',
  summary: 'List Applications',
  icon: 'app-window',
  group: 'Applications',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of applications to return per page (default 20, max 1000)'),
    friendly_name: z.string().optional().describe('Search applications by friendly name'),
  }),
  output: z.object({
    applications: z.array(applicationSchema).describe('Array of applications'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };
    if (params.friendly_name) query.FriendlyName = params.friendly_name;

    const data = await api<{ applications: RawApplication[] }>('/Applications.json', { query });
    return { applications: (data.applications ?? []).map(mapApplication) };
  },
});
