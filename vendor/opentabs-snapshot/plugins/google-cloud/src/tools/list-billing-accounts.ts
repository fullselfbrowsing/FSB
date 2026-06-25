import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi } from '../gcloud-api.js';
import { billingAccountSchema, mapBillingAccount } from './schemas.js';
import type { RawBillingAccount } from './schemas.js';

export const listBillingAccounts = defineTool({
  name: 'list_billing_accounts',
  displayName: 'List Billing Accounts',
  description: 'List billing accounts accessible to the current user.',
  summary: 'List billing accounts',
  icon: 'credit-card',
  group: 'Billing',
  input: z.object({
    page_size: z.number().int().min(1).max(100).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    billing_accounts: z.array(billingAccountSchema).describe('List of billing accounts'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const data = await gcpApi<{ billingAccounts?: RawBillingAccount[]; nextPageToken?: string }>(
      'https://cloudbilling.googleapis.com/v1/billingAccounts',
      { params: { pageSize: params.page_size ?? 50, pageToken: params.page_token } },
    );
    return {
      billing_accounts: (data.billingAccounts ?? []).map(mapBillingAccount),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
