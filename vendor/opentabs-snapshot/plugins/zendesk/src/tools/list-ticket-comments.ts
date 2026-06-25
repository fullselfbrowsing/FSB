import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { commentSchema, mapComment } from './schemas.js';
import type { RawComment } from './schemas.js';

export const listTicketComments = defineTool({
  name: 'list_ticket_comments',
  displayName: 'List Ticket Comments',
  description:
    'List all comments on a support ticket. Returns comments with author information, body text, creation timestamp, and public/private status. Supports pagination for tickets with many comments.',
  summary: 'List comments on a ticket',
  icon: 'message-square',
  group: 'Tickets',
  input: z.object({
    ticket_id: z.number().int().describe('The ID of the ticket to list comments for'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Number of comments per page (default 25, max 100)'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('Array of comment objects'),
  }),
  handle: async params => {
    const data = await api<{ comments: RawComment[] }>(`/tickets/${params.ticket_id}/comments.json`, {
      query: {
        page: params.page,
        per_page: params.per_page,
      },
    });

    return {
      comments: (data.comments ?? []).map(mapComment),
    };
  },
});
