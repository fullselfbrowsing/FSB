import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';
import { inboxFilterSchema, mapInboxFilter } from './schemas.js';

export const getInboxFilters = defineTool({
  name: 'get_inbox_filters',
  displayName: 'Get Inbox Filters',
  description: 'Get the available inbox filter categories and their unread message counts.',
  summary: 'Get inbox filter categories with unread counts',
  icon: 'filter',
  group: 'Messages',
  input: z.object({}),
  output: z.object({
    filters: z.array(inboxFilterSchema).describe('Available inbox filters'),
  }),
  handle: async () => {
    const data = await graphql<{
      viewer: {
        messagingInbox: {
          inboxFiltersConfig: {
            filters: Array<Record<string, unknown>>;
          };
        };
      };
    }>('FetchInboxFiltersConfig', QUERY_HASHES.FetchInboxFiltersConfig);

    const filters = data.viewer.messagingInbox.inboxFiltersConfig.filters ?? [];

    return {
      filters: filters.map(mapInboxFilter),
    };
  },
});
