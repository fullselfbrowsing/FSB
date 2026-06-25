import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawVerifyService, mapVerifyService, verifyServiceSchema } from './schemas.js';

export const getVerifyService = defineTool({
  name: 'get_verify_service',
  displayName: 'Get Verify Service',
  description: 'Get a specific verification service by its SID.',
  summary: 'Get Verify Service',
  icon: 'shield-check',
  group: 'Verify',
  input: z.object({
    sid: z.string().describe('Verify Service SID (e.g., VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: verifyServiceSchema,
  handle: async params => {
    const data = await subApi<RawVerifyService>('https://verify.twilio.com/v2', `/Services/${params.sid}`);
    return mapVerifyService(data);
  },
});
