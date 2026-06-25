import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getSessionInfo } from '../snowflake-api.js';

export const getSession = defineTool({
  name: 'get_session',
  displayName: 'Get Session',
  description:
    'Get the current Snowflake session context including user email, active role, organization, and build version.',
  summary: 'Get current session context',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    userEmail: z.string().describe('Authenticated user email address'),
    role: z.string().describe('Active Snowflake role'),
    orgId: z.string().describe('Snowflake organization numeric ID'),
    orgShortName: z.string().describe('Snowflake account short name (locator)'),
    appServerUrl: z.string().describe('Snowflake API server URL'),
  }),
  handle: async () => {
    const info = getSessionInfo();
    return {
      userEmail: info.userEmail,
      role: info.role,
      orgId: info.orgId,
      orgShortName: info.orgShortName,
      appServerUrl: info.appServerUrl,
    };
  },
});
