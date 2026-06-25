import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './calendly-api.js';

// Users
import { getCurrentUser } from './tools/get-current-user.js';
import { getUserPermissions } from './tools/get-user-permissions.js';

// Organization
import { getOrganization } from './tools/get-organization.js';
import { getOrganizationStatistics } from './tools/get-organization-statistics.js';

// Event Types
import { activateEventType } from './tools/activate-event-type.js';
import { cloneEventType } from './tools/clone-event-type.js';
import { createEventType } from './tools/create-event-type.js';
import { deactivateEventType } from './tools/deactivate-event-type.js';
import { deleteEventType } from './tools/delete-event-type.js';
import { getEventType } from './tools/get-event-type.js';
import { listEventTypes } from './tools/list-event-types.js';
import { updateEventType } from './tools/update-event-type.js';

// Scheduled Events
import { listScheduledEvents } from './tools/list-scheduled-events.js';

// Calendars
import { getUserBusyTimes } from './tools/get-user-busy-times.js';
import { listCalendarAccounts } from './tools/list-calendar-accounts.js';

class CalendlyPlugin extends OpenTabsPlugin {
  readonly name = 'calendly';
  readonly description = 'OpenTabs plugin for Calendly';
  override readonly displayName = 'Calendly';
  readonly urlPatterns = ['*://*.calendly.com/*'];
  override readonly homepage = 'https://calendly.com';
  readonly tools: ToolDefinition[] = [
    // Users
    getCurrentUser,
    getUserPermissions,

    // Organization
    getOrganization,
    getOrganizationStatistics,

    // Event Types
    listEventTypes,
    getEventType,
    createEventType,
    updateEventType,
    deleteEventType,
    cloneEventType,
    activateEventType,
    deactivateEventType,

    // Scheduled Events
    listScheduledEvents,

    // Calendars
    listCalendarAccounts,
    getUserBusyTimes,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new CalendlyPlugin();
