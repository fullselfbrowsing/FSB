import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getCustomerInfo } from '../bestbuy-api.js';
import { customerSchema, mapCustomer, type RawCustomerPrimaryInfo } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Best Buy user. Returns name, email, phone number, and My Best Buy rewards loyalty information (member ID, tier name, and tier code).',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    customer: customerSchema.describe('Customer profile information'),
  }),
  handle: async () => {
    const pageCustomer = getCustomerInfo();
    if (!pageCustomer) {
      throw ToolError.auth('Not authenticated — please log in to Best Buy.');
    }

    const primaryInfo = await api<RawCustomerPrimaryInfo>('/profile/rest/customerprimaryinfo');

    return { customer: mapCustomer(pageCustomer, primaryInfo) };
  },
});
