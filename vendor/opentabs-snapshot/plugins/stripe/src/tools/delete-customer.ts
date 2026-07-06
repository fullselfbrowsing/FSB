import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';

export const deleteCustomer = defineTool({
  name: 'delete_customer',
  displayName: 'Delete Customer',
  description: 'Permanently delete a customer and all their subscriptions and payment sources. This cannot be undone.',
  summary: 'Delete a customer',
  icon: 'user-x',
  group: 'Customers',
  input: z.object({
    customer_id: z.string().describe('Customer ID to delete (e.g., cus_xxx)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api(`/customers/${params.customer_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
