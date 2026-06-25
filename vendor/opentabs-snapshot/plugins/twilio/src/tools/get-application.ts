import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawApplication, applicationSchema, mapApplication } from './schemas.js';

export const getApplication = defineTool({
  name: 'get_application',
  displayName: 'Get Application',
  description: 'Get a specific TwiML application by its SID.',
  summary: 'Get Application',
  icon: 'app-window',
  group: 'Applications',
  input: z.object({
    sid: z.string().describe('Application SID (e.g., APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: applicationSchema,
  handle: async params => {
    const data = await api<RawApplication>(`/Applications/${params.sid}.json`);
    return mapApplication(data);
  },
});
