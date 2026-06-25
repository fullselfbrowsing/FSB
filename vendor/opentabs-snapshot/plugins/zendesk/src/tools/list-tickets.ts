import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { ticketSchema, mapTicket } from './schemas.js';
import type { RawTicket } from './schemas.js';

export const listTickets = defineTool({
  name: 'list_tickets',
  displayName: 'List Tickets',
  description:
    'List support tickets from Zendesk. Returns tickets with full details including subject, status, priority, assignee, requester, and timestamps. Supports pagination and sorting by created/updated date.',
  summary: 'List support tickets with pagination and sorting',
  icon: 'ticket',
  group: 'Tickets',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Number of tickets per page (default 25, max 100)'),
    sort_by: z
      .string()
      .optional()
      .describe('Field to sort by (e.g., "created_at", "updated_at", "status", "priority")'),
    sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction: ascending or descending'),
  }),
  output: z.object({
    tickets: z.array(ticketSchema).describe('Array of ticket objects'),
    count: z.number().describe('Total number of tickets across all pages'),
  }),
  handle: async params => {
    const data = await api<{ tickets: RawTicket[]; count: number }>('/tickets.json', {
      query: {
        page: params.page,
        per_page: params.per_page,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
      },
    });

    return {
      tickets: (data.tickets ?? []).map(mapTicket),
      count: data.count ?? 0,
    };
  },
});
