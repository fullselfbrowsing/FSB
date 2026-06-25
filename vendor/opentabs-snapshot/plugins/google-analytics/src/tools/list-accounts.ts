import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { suiteApi } from '../ga-api.js';
import { accountSchema, propertySchema, mapAccount, mapProperty, type RawEntityHeader } from './schemas.js';

interface EntityHeadersResponse {
  header?: RawEntityHeader[];
  nextPageToken?: string;
}

export const listAccounts = defineTool({
  name: 'list_accounts',
  displayName: 'List Accounts',
  description:
    'List all Google Analytics accounts and GA4 properties accessible to the current user. Returns accounts with their properties nested inside.',
  summary: 'List all GA accounts and properties',
  icon: 'building-2',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    accounts: z
      .array(
        accountSchema.extend({
          properties: z.array(propertySchema).describe('GA4 properties under this account'),
        }),
      )
      .describe('All accessible GA accounts with their properties'),
  }),
  handle: async () => {
    const accounts: Array<ReturnType<typeof mapAccount> & { properties: ReturnType<typeof mapProperty>[] }> = [];
    const propertyMap = new Map<string, ReturnType<typeof mapProperty>[]>();

    let pageToken = '';
    do {
      const data = await suiteApi<EntityHeadersResponse>('/v1/search/gaEntityHeadersPaged', {
        personalOnly: false,
        pageOptions: { pageToken: { token: pageToken } },
      });

      for (const header of data.header ?? []) {
        if (header.type === 'GA_ACCOUNT') {
          const mapped = mapAccount(header);
          accounts.push({ ...mapped, properties: [] });
        } else if (header.type === 'GA_PROPERTY') {
          const mapped = mapProperty(header);
          const parentId = mapped.account_id;
          if (!propertyMap.has(parentId)) propertyMap.set(parentId, []);
          propertyMap.get(parentId)?.push(mapped);
        }
      }

      pageToken = data.nextPageToken ?? '';
    } while (pageToken);

    for (const account of accounts) {
      account.properties = propertyMap.get(account.id) ?? [];
    }

    return { accounts };
  },
});
