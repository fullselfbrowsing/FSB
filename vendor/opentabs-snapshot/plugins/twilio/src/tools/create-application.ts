import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawApplication, applicationSchema, mapApplication } from './schemas.js';

export const createApplication = defineTool({
  name: 'create_application',
  displayName: 'Create Application',
  description: 'Create a new TwiML application for handling voice and SMS webhooks.',
  summary: 'Create Application',
  icon: 'plus',
  group: 'Applications',
  input: z.object({
    friendly_name: z.string().describe('Friendly name for the application'),
    voice_url: z.string().optional().describe('URL for incoming voice requests'),
    voice_method: z.string().optional().describe('HTTP method for voice URL (GET or POST)'),
    sms_url: z.string().optional().describe('URL for incoming SMS requests'),
    sms_method: z.string().optional().describe('HTTP method for SMS URL (GET or POST)'),
    status_callback: z.string().optional().describe('URL for status callback webhooks'),
  }),
  output: applicationSchema,
  handle: async params => {
    const body: Record<string, string> = {
      FriendlyName: params.friendly_name,
    };
    if (params.voice_url !== undefined) body.VoiceUrl = params.voice_url;
    if (params.voice_method !== undefined) body.VoiceMethod = params.voice_method;
    if (params.sms_url !== undefined) body.SmsUrl = params.sms_url;
    if (params.sms_method !== undefined) body.SmsMethod = params.sms_method;
    if (params.status_callback !== undefined) body.StatusCallback = params.status_callback;

    const data = await api<RawApplication>('/Applications.json', { method: 'POST', body });
    return mapApplication(data);
  },
});
