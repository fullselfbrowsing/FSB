import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { accountSchema, type RawAccount, mapAccount } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the current Twilio account info including SID, friendly name, status, and type.',
  summary: 'Get current Twilio account info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    account: accountSchema.describe('Current Twilio account details'),
  }),
  handle: async () => {
    const data = await api<RawAccount>('/.json');
    return { account: mapAccount(data) };
  },
});
