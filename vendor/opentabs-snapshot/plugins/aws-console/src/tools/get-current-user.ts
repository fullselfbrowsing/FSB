import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getAccountInfo, getCurrentRegion } from '../aws-api.js';
import { accountInfoSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently authenticated AWS user profile including account ID, username, ARN, and current region. Reads from console session data and cookies — does not make an AWS API call.',
  summary: 'Get the authenticated AWS user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: accountInfoSchema }),
  handle: async () => {
    const info = getAccountInfo();
    return {
      user: {
        account_id: info.accountId,
        username: info.username,
        arn: info.arn,
        session_arn: info.sessionARN,
        region: info.region ? info.region : getCurrentRegion(),
        signin_type: info.signinType,
      },
    };
  },
});
