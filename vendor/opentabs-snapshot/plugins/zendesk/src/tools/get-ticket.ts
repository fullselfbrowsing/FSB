import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { ticketSchema, mapTicket } from './schemas.js';
import type { RawTicket } from './schemas.js';

export const getTicket = defineTool({
  name: 'get_ticket',
  displayName: 'Get Ticket',
  description:
    'Get detailed information about a specific support ticket by its ID. Returns the full ticket object including subject, description, status, priority, assignee, requester, tags, and all timestamps.',
  summary: 'Get a single ticket by ID',
  icon: 'ticket',
  group: 'Tickets',
  input: z.object({
    ticket_id: z.number().int().describe('The ID of the ticket to retrieve'),
  }),
  output: z.object({
    ticket: ticketSchema.describe('The ticket object'),
  }),
  handle: async params => {
    const response = await api<{ ticket: RawTicket }>(`/tickets/${params.ticket_id}.json`);

    return {
      ticket: mapTicket(response.ticket),
    };
  },
});
