import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getStoreId } from '../target-api.js';

const listItemSchema = z.object({
  item_id: z.string().describe('List item ID'),
  tcin: z.string().describe('Target item number (TCIN)'),
  title: z.string().describe('Item title'),
  quantity: z.number().int().describe('Quantity'),
  is_completed: z.boolean().describe('Whether the item is marked as completed'),
  added_date: z.string().describe('Date item was added (ISO 8601)'),
  image_url: z.string().describe('Item image URL'),
});

interface RawListItem {
  list_item_id?: string;
  tcin?: string;
  item_title?: string;
  requested_quantity?: number;
  item_state?: string;
  added_ts?: string;
  images?: { primary_image_url?: string };
}

interface RawListDetail {
  list_id?: string;
  list_title?: string;
  pending_list_items?: RawListItem[];
  completed_list_items?: RawListItem[];
  total_items_count?: number;
  pending_items_count?: number;
  completed_items_count?: number;
}

export const getShoppingList = defineTool({
  name: 'get_shopping_list',
  displayName: 'Get Shopping List',
  description: 'Get items in a specific Target shopping list by its list ID. Use list_shopping_lists to find list IDs.',
  summary: 'Get items in a shopping list',
  icon: 'clipboard-list',
  group: 'Lists',
  input: z.object({
    list_id: z.string().describe('Shopping list ID (from list_shopping_lists)'),
  }),
  output: z.object({
    list_id: z.string().describe('List ID'),
    list_title: z.string().describe('List title'),
    total_items: z.number().int().describe('Total number of items'),
    items: z.array(listItemSchema),
  }),
  handle: async params => {
    let data: RawListDetail;
    try {
      data = await api<RawListDetail>(`lists/v4/${params.list_id}`, {
        query: { location_id: getStoreId() },
      });
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw ToolError.notFound(`Shopping list "${params.list_id}" not found.`);
    }

    const mapItem = (i: RawListItem, completed: boolean) => ({
      item_id: i.list_item_id ?? '',
      tcin: i.tcin ?? '',
      title: i.item_title ?? '',
      quantity: i.requested_quantity ?? 1,
      is_completed: completed,
      added_date: i.added_ts ?? '',
      image_url: i.images?.primary_image_url ?? '',
    });

    const pending = (data.pending_list_items ?? []).map(i => mapItem(i, false));
    const completed = (data.completed_list_items ?? []).map(i => mapItem(i, true));

    return {
      list_id: data.list_id ?? params.list_id,
      list_title: data.list_title ?? '',
      total_items: data.total_items_count ?? pending.length + completed.length,
      items: [...pending, ...completed],
    };
  },
});
