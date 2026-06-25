import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './google-calendar-api.js';
import { createCalendar } from './tools/create-calendar.js';
import { createEvent } from './tools/create-event.js';
import { deleteCalendar } from './tools/delete-calendar.js';
import { deleteEvent } from './tools/delete-event.js';
import { getCalendar } from './tools/get-calendar.js';
import { getColors } from './tools/get-colors.js';
import { getEvent } from './tools/get-event.js';
import { getSetting } from './tools/get-setting.js';
import { listCalendars } from './tools/list-calendars.js';
import { listEventInstances } from './tools/list-event-instances.js';
import { listEvents } from './tools/list-events.js';
import { listSettings } from './tools/list-settings.js';
import { moveEvent } from './tools/move-event.js';
import { queryFreebusy } from './tools/query-freebusy.js';
import { quickAddEvent } from './tools/quick-add-event.js';
import { searchEvents } from './tools/search-events.js';
import { updateCalendar } from './tools/update-calendar.js';
import { updateEvent } from './tools/update-event.js';

class GoogleCalendarPlugin extends OpenTabsPlugin {
  readonly name = 'google-calendar';
  readonly description = 'OpenTabs plugin for Google Calendar';
  override readonly displayName = 'Google Calendar';
  readonly urlPatterns = ['*://calendar.google.com/*'];
  override readonly homepage = 'https://calendar.google.com';
  readonly tools: ToolDefinition[] = [
    // Events
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    quickAddEvent,
    moveEvent,
    listEventInstances,
    searchEvents,
    // Calendars
    listCalendars,
    getCalendar,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    // Free/Busy
    queryFreebusy,
    // Settings
    listSettings,
    getSetting,
    getColors,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GoogleCalendarPlugin();
