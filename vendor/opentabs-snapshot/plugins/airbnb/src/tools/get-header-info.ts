import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';
import { headerMenuItemSchema, mapHeaderItem } from './schemas.js';

export const getHeaderInfo = defineTool({
  name: 'get_header_info',
  displayName: 'Get Header Info',
  description: 'Get the Airbnb header navigation data including menu items, avatar URL, and unread message count.',
  summary: 'Get header navigation and unread counts',
  icon: 'layout-dashboard',
  group: 'Navigation',
  input: z.object({}),
  output: z.object({
    avatar_url: z.string().nullable().describe('URL of the current user avatar'),
    menu_items: z.array(headerMenuItemSchema).describe('Navigation menu items'),
    unread_message_count: z.number().int().describe('Number of unread messages'),
  }),
  handle: async () => {
    const data = await graphql<{
      presentation: {
        header: {
          avatarImageUrl?: string | null;
          menuItemGroups?: Array<{
            groupId?: string;
            items?: Array<Record<string, unknown>>;
          }>;
        };
      };
    }>('Header', QUERY_HASHES.Header, {
      cdnCacheSafe: false,
      hasLoggedIn: true,
      isInitialLoad: false,
      source: 'EXPLORE',
      supportsM13ListingsSetupFlow: true,
    });

    const header = data.presentation.header;
    const secondaryGroup = header.menuItemGroups?.find(g => g.groupId === 'SECONDARY_MENU');
    const items = secondaryGroup?.items ?? header.menuItemGroups?.[0]?.items ?? [];

    const menuItems = items.map(mapHeaderItem);

    const messagesItem = menuItems.find(i => i.id === 'MESSAGES');
    const unreadCount = messagesItem?.badge_count ?? 0;

    return {
      avatar_url: header.avatarImageUrl ?? null,
      menu_items: menuItems,
      unread_message_count: unreadCount,
    };
  },
});
