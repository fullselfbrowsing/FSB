import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { phoneNumberSchema, type RawPhoneNumber, mapPhoneNumber } from './schemas.js';

export const updatePhoneNumber = defineTool({
  name: 'update_phone_number',
  displayName: 'Update Phone Number',
  description:
    'Update configuration for an incoming phone number. Change the friendly name, voice/SMS webhook URLs, HTTP methods, or status callback.',
  summary: 'Update phone number configuration',
  icon: 'pencil',
  group: 'Phone Numbers',
  input: z.object({
    sid: z.string().min(1).describe('Phone number SID (PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
    friendly_name: z.string().optional().describe('New friendly name for the phone number'),
    voice_url: z.string().optional().describe('URL for incoming voice calls'),
    voice_method: z.enum(['GET', 'POST']).optional().describe('HTTP method for voice URL'),
    sms_url: z.string().optional().describe('URL for incoming SMS messages'),
    sms_method: z.enum(['GET', 'POST']).optional().describe('HTTP method for SMS URL'),
    status_callback: z.string().optional().describe('Status callback URL'),
  }),
  output: z.object({
    phone_number: phoneNumberSchema.describe('The updated phone number'),
  }),
  handle: async params => {
    const body: Record<string, string> = {};
    if (params.friendly_name !== undefined) body.FriendlyName = params.friendly_name;
    if (params.voice_url !== undefined) body.VoiceUrl = params.voice_url;
    if (params.voice_method !== undefined) body.VoiceMethod = params.voice_method;
    if (params.sms_url !== undefined) body.SmsUrl = params.sms_url;
    if (params.sms_method !== undefined) body.SmsMethod = params.sms_method;
    if (params.status_callback !== undefined) body.StatusCallback = params.status_callback;

    const data = await api<RawPhoneNumber>(`/IncomingPhoneNumbers/${params.sid}.json`, {
      method: 'POST',
      body,
    });
    return { phone_number: mapPhoneNumber(data) };
  },
});
