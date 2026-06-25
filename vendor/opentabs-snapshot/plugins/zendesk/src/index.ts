import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './zendesk-api.js';
import { listTickets } from './tools/list-tickets.js';
import { getTicket } from './tools/get-ticket.js';
import { createTicket } from './tools/create-ticket.js';
import { updateTicket } from './tools/update-ticket.js';
import { deleteTicket } from './tools/delete-ticket.js';
import { listTicketComments } from './tools/list-ticket-comments.js';
import { addTicketComment } from './tools/add-ticket-comment.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getUser } from './tools/get-user.js';
import { listUsers } from './tools/list-users.js';
import { listOrganizations } from './tools/list-organizations.js';
import { getOrganization } from './tools/get-organization.js';
import { listGroups } from './tools/list-groups.js';
import { search } from './tools/search.js';
import { listViews } from './tools/list-views.js';
import { getViewTickets } from './tools/get-view-tickets.js';
import { listTags } from './tools/list-tags.js';

class ZendeskPlugin extends OpenTabsPlugin {
  readonly name = 'zendesk';
  readonly description =
    'OpenTabs plugin for Zendesk. Manage tickets, users, organizations, and groups in Zendesk Support.';
  override readonly displayName = 'Zendesk';
  override readonly homepage = 'https://www.zendesk.com';
  readonly urlPatterns = ['*://*.zendesk.com/*'];

  readonly tools: ToolDefinition[] = [
    // Tickets
    listTickets,
    getTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    listTicketComments,
    addTicketComment,
    // Users
    getCurrentUser,
    getUser,
    listUsers,
    // Organizations
    listOrganizations,
    getOrganization,
    // Groups
    listGroups,
    // Search
    search,
    // Views
    listViews,
    getViewTickets,
    // Tags
    listTags,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new ZendeskPlugin();
