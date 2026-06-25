import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawVerifyService, mapVerifyService, verifyServiceSchema } from './schemas.js';

export const createVerifyService = defineTool({
  name: 'create_verify_service',
  displayName: 'Create Verify Service',
  description: 'Create a new verification service for sending OTP codes via SMS, call, or email.',
  summary: 'Create Verify Service',
  icon: 'plus',
  group: 'Verify',
  input: z.object({
    friendly_name: z.string().describe('Friendly name for the verify service'),
    code_length: z
      .number()
      .int()
      .min(4)
      .max(10)
      .optional()
      .describe('Length of the verification code (default 6, range 4-10)'),
  }),
  output: verifyServiceSchema,
  handle: async params => {
    const body: Record<string, string> = {
      FriendlyName: params.friendly_name,
    };
    if (params.code_length !== undefined) body.CodeLength = String(params.code_length);

    const data = await subApi<RawVerifyService>('https://verify.twilio.com/v2', '/Services', { method: 'POST', body });
    return mapVerifyService(data);
  },
});
