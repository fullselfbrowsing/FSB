import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { ticketSchema, mapTicket } from './schemas.js';
import type { RawTicket } from './schemas.js';

export const addTicketComment = defineTool({
  name: 'add_ticket_comment',
  displayName: 'Add Ticket Comment',
  description:
    'Add a comment to an existing support ticket. Comments can be public (visible to the requester) or private (internal notes for agents only). Returns the updated ticket with the new comment.',
  summary: 'Add a comment to a ticket',
  icon: 'message-square-plus',
  group: 'Tickets',
  input: z.object({
    ticket_id: z.number().int().describe('The ID of the ticket to add a comment to'),
    body: z.string().describe('The comment text body'),
    public: z
      .boolean()
      .optional()
      .describe('Whether the comment is public (visible to requester) or private (internal note). Default is true.'),
  }),
  output: z.object({
    ticket: ticketSchema.describe('The updated ticket with the new comment'),
  }),
  handle: async params => {
    const commentData: Record<string, unknown> = {
      body: params.body,
    };

    if (params.public !== undefined) {
      commentData.public = params.public;
    }

    const response = await api<{ ticket: RawTicket }>(`/tickets/${params.ticket_id}.json`, {
      method: 'PUT',
      body: {
        ticket: {
          comment: commentData,
        },
      },
    });

    return {
      ticket: mapTicket(response.ticket),
    };
  },
});
