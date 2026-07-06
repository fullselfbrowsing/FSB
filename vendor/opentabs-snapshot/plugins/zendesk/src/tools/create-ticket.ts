import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { ticketSchema, mapTicket } from './schemas.js';
import type { RawTicket } from './schemas.js';

export const createTicket = defineTool({
  name: 'create_ticket',
  displayName: 'Create Ticket',
  description:
    'Create a new support ticket in Zendesk. Requires a subject and initial comment body. Optionally set priority, type, tags, assignee, group, and requester. Returns the newly created ticket with its assigned ID.',
  summary: 'Create a new support ticket',
  icon: 'plus',
  group: 'Tickets',
  input: z.object({
    subject: z.string().describe('The subject/title of the ticket'),
    body: z.string().describe('The initial comment body (ticket description)'),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().describe('Priority level of the ticket'),
    type: z.enum(['problem', 'incident', 'question', 'task']).optional().describe('Type of the ticket'),
    tags: z.array(z.string()).optional().describe('Tags to apply to the ticket'),
    assignee_id: z.number().int().optional().describe('User ID to assign the ticket to'),
    group_id: z.number().int().optional().describe('Group ID to assign the ticket to'),
    requester_id: z.number().int().optional().describe('User ID of the requester (ticket submitter)'),
  }),
  output: z.object({
    ticket: ticketSchema.describe('The newly created ticket'),
  }),
  handle: async params => {
    const ticketData: Record<string, unknown> = {
      subject: params.subject,
      comment: {
        body: params.body,
      },
    };

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
    if (params.requester_id !== undefined) {
      ticketData.requester_id = params.requester_id;
    }

    const response = await api<{ ticket: RawTicket }>('/tickets.json', {
      method: 'POST',
      body: { ticket: ticketData },
    });

    return {
      ticket: mapTicket(response.ticket),
    };
  },
});
