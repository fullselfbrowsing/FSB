import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiRaw } from '../zendesk-api.js';

export const deleteTicket = defineTool({
  name: 'delete_ticket',
  displayName: 'Delete Ticket',
  description:
    'Permanently delete a support ticket by its ID. This action cannot be undone. The ticket and all its comments will be removed from Zendesk.',
  summary: 'Delete a ticket permanently',
  icon: 'trash-2',
  group: 'Tickets',
  input: z.object({
    ticket_id: z.number().int().describe('The ID of the ticket to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  handle: async params => {
    await apiRaw(`/tickets/${params.ticket_id}.json`, {
      method: 'DELETE',
    });

    return {
      success: true,
    };
  },
});
