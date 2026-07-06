import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { ticketSchema, mapTicket } from './schemas.js';
import type { RawTicket } from './schemas.js';

export const updateTicket = defineTool({
  name: 'update_ticket',
  displayName: 'Update Ticket',
  description:
    'Update an existing support ticket. Change the subject, status, priority, type, tags, assignee, or group. Only specified fields are updated; omitted fields remain unchanged. Returns the updated ticket.',
  summary: 'Update an existing ticket',
  icon: 'edit',
  group: 'Tickets',
  input: z.object({
    ticket_id: z.number().int().describe('The ID of the ticket to update'),
    subject: z.string().optional().describe('New subject/title for the ticket'),
    status: z
      .enum(['new', 'open', 'pending', 'hold', 'solved', 'closed'])
      .optional()
      .describe('New status for the ticket'),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().describe('New priority level'),
    type: z.enum(['problem', 'incident', 'question', 'task']).optional().describe('New type for the ticket'),
    tags: z.array(z.string()).optional().describe('New tags (replaces existing tags)'),
    assignee_id: z.number().int().optional().describe('New assignee user ID'),
    group_id: z.number().int().optional().describe('New group ID'),
  }),
  output: z.object({
    ticket: ticketSchema.describe('The updated ticket'),
  }),
  handle: async params => {
    const ticketData: Record<string, unknown> = {};

    if (params.subject !== undefined) {
      ticketData.subject = params.subject;
    }
    if (params.status) {
      ticketData.status = params.status;
    }
    if (params.priority) {
      ticketData.priority = params.priority;
    }
    if (params.type) {
      ticketData.type = params.type;
    }
    if (params.tags) {
      ticketData.tags = params.tags;
    }
    if (params.assignee_id !== undefined) {
      ticketData.assignee_id = params.assignee_id;
    }
    if (params.group_id !== undefined) {
      ticketData.group_id = params.group_id;
    }

    const response = await api<{ ticket: RawTicket }>(`/tickets/${params.ticket_id}.json`, {
      method: 'PUT',
      body: { ticket: ticketData },
    });

    return {
      ticket: mapTicket(response.ticket),
    };
  },
});
