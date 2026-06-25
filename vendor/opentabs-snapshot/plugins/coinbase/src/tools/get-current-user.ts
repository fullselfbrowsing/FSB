import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawUserProperties, mapUserProperties, userPropertiesSchema } from './schemas.js';

const QUERY = `query GetCurrentUser {
  viewer {
    userProperties {
      uuid name email nativeCurrency avatarUrl createdAt
      country { code name }
    }
  }
}`;

interface Response {
  viewer: { userProperties: RawUserProperties };
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Coinbase user profile including name, email, native currency, avatar, account creation date, and country.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userPropertiesSchema }),
  handle: async () => {
    const data = await gql<Response>(QUERY);
    return { user: mapUserProperties(data.viewer.userProperties) };
  },
});
