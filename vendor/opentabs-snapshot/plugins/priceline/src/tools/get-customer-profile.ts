import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, getEmail, getAuthToken } from '../priceline-api.js';
import { type RawCustomerProfile, mapCustomerProfile, customerProfileSchema } from './schemas.js';

const PERSISTED_HASH = '48d8218318dd4384631ab71f001f4475b9e47312a6bcfea98af8beb90526d7ff';

interface ProfileResponse {
  authorizedCustomerProfile?: RawCustomerProfile;
}

export const getCustomerProfile = defineTool({
  name: 'get_customer_profile',
  displayName: 'Get Customer Profile',
  description: "Get the authenticated user's Priceline customer profile including loyalty tier and audience segments.",
  summary: 'Get your Priceline profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    email: z.string().describe('Customer email address'),
    profile: customerProfileSchema.describe('Customer profile data'),
  }),
  handle: async () => {
    const email = getEmail();
    const data = await graphql<ProfileResponse>(
      'authorizedCustomerProfile',
      { authToken: getAuthToken(), email },
      PERSISTED_HASH,
    );
    return {
      email,
      profile: mapCustomerProfile(data.authorizedCustomerProfile ?? {}),
    };
  },
});
