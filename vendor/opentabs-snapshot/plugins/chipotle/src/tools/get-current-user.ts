import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawCustomer, customerSchema, mapCustomer } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently authenticated Chipotle user profile including name, email, phone number, country, and account creation date.',
  summary: 'Get current user profile and account info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: customerSchema.describe('Customer profile'),
  }),
  handle: async () => {
    const data = await api<RawCustomer>('/customer/v2/customer');
    return { user: mapCustomer(data) };
  },
});
