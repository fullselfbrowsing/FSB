import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';

const savedItemSchema = z.object({
  id: z.string().describe('Saved item ID'),
  title: z.string().describe('Title of the saved item'),
  url: z.string().describe('URL to the saved item'),
  image_url: z.string().describe('Thumbnail image URL'),
  saved_time: z.number().int().describe('Unix timestamp when the item was saved'),
  source: z.string().describe('Source of the saved item (e.g., Marketplace, Post)'),
});

interface SavedDashboardResponse {
  viewer?: {
    saved_collection?: {
      saved_items?: {
        edges?: Array<{
          node?: {
            id?: string;
            savable?: {
              __typename?: string;
              id?: string;
              title?: string;
              url?: string;
              image?: { uri?: string };
              saved_timestamp?: number;
            };
          };
        }>;
        page_info?: { has_next_page?: boolean; end_cursor?: string };
      };
    };
  };
}

export const listSaved = defineTool({
  name: 'list_saved',
  displayName: 'List Saved Items',
  description:
    'List items saved by the current user on Facebook (posts, marketplace listings, links, videos, etc.). Returns title, URL, and saved timestamp.',
  summary: 'List your saved items',
  icon: 'bookmark',
  group: 'Saved',
  input: z.object({
    count: z.number().int().min(1).max(20).optional().describe('Number of saved items to return (default 10, max 20)'),
  }),
  output: z.object({
    items: z.array(savedItemSchema),
    has_next_page: z.boolean().describe('Whether more saved items are available'),
  }),
  handle: async params => {
    const data = await graphql<SavedDashboardResponse>('CometSaveDashboardRootQuery', {
      count: params.count ?? 10,
      scale: 2,
    });

    const items = data.viewer?.saved_collection?.saved_items;
    const edges = items?.edges ?? [];

    return {
      items: edges.map(e => {
        const s = e.node?.savable;
        return {
          id: s?.id ?? e.node?.id ?? '',
          title: s?.title ?? '',
          url: s?.url ?? '',
          image_url: s?.image?.uri ?? '',
          saved_time: s?.saved_timestamp ?? 0,
          source: s?.__typename ?? '',
        };
      }),
      has_next_page: items?.page_info?.has_next_page ?? false,
    };
  },
});
