import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawTicket, mapTicket, ticketSchema } from './schemas.js';

export const getViewTickets = defineTool({
  name: 'get_view_tickets',
  displayName: 'Get View Tickets',
  description: 'Get the list of tickets in a specific Zendesk view. Use list_views to discover available views.',
  summary: 'Get tickets in a view',
  icon: 'layout-list',
  group: 'Views',
  input: z.object({
    view_id: z.number().int().describe('View ID to retrieve tickets from'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Number of results per page (default 25, max 100)'),
  }),
  output: z.object({
    tickets: z.array(ticketSchema).describe('List of tickets in the view'),
    count: z.number().int().describe('Total number of tickets in the view'),
  }),
  handle: async params => {
    const data = await api<{ tickets: RawTicket[]; count: number }>(`/views/${params.view_id}/tickets.json`, {
      query: {
        page: params.page,
        per_page: params.per_page,
      },
    });
    return {
      tickets: (data.tickets ?? []).map(mapTicket),
      count: data.count ?? 0,
    };
  },
});
