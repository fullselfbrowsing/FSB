import { z } from 'zod';

// --- Raw API response types ---

export interface RawDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface RawAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
  optional?: boolean;
}

export interface RawReminder {
  method?: string;
  minutes?: number;
}

export interface RawEvent {
  id?: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  creator?: { email?: string; displayName?: string; self?: boolean };
  organizer?: { email?: string; displayName?: string; self?: boolean };
  start?: RawDateTime;
  end?: RawDateTime;
  created?: string;
  updated?: string;
  recurringEventId?: string;
  attendees?: RawAttendee[];
  reminders?: { useDefault?: boolean; overrides?: RawReminder[] };
  colorId?: string;
  transparency?: string;
  visibility?: string;
  iCalUID?: string;
  eventType?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  recurrence?: string[];
}

export interface RawCalendarListEntry {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  timeZone?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  accessRole?: string;
  primary?: boolean;
  hidden?: boolean;
  deleted?: boolean;
}

export interface RawCalendar {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  timeZone?: string;
}

export interface RawSetting {
  id?: string;
  value?: string;
}

export interface RawColorDefinition {
  background?: string;
  foreground?: string;
}

// --- Shared Zod schemas ---

export const dateTimeSchema = z.object({
  date_time: z.string().describe('ISO 8601 datetime (e.g., "2024-01-15T10:30:00-08:00"), empty for all-day events'),
  date: z.string().describe('Date in YYYY-MM-DD format for all-day events, empty for timed events'),
  time_zone: z.string().describe('IANA time zone (e.g., "America/Los_Angeles")'),
});

export const attendeeSchema = z.object({
  email: z.string().describe('Attendee email address'),
  display_name: z.string().describe('Attendee display name'),
  response_status: z.string().describe('Response status: needsAction, declined, tentative, or accepted'),
  is_self: z.boolean().describe('Whether this attendee is the current user'),
  is_organizer: z.boolean().describe('Whether this attendee is the organizer'),
  is_optional: z.boolean().describe('Whether attendance is optional'),
});

export const reminderSchema = z.object({
  method: z.string().describe('Reminder method: email or popup'),
  minutes: z.number().int().describe('Minutes before the event to trigger the reminder'),
});

export const eventSchema = z.object({
  id: z.string().describe('Event ID'),
  status: z.string().describe('Event status: confirmed, tentative, or cancelled'),
  html_url: z.string().describe('URL to view the event in Google Calendar'),
  summary: z.string().describe('Event title'),
  description: z.string().describe('Event description'),
  location: z.string().describe('Event location'),
  creator_email: z.string().describe('Email of the event creator'),
  organizer_email: z.string().describe('Email of the event organizer'),
  start: dateTimeSchema.describe('Event start time'),
  end: dateTimeSchema.describe('Event end time'),
  created_at: z.string().describe('ISO 8601 timestamp when the event was created'),
  updated_at: z.string().describe('ISO 8601 timestamp when the event was last updated'),
  recurring_event_id: z.string().describe('ID of the recurring event this instance belongs to, empty if not recurring'),
  attendees: z.array(attendeeSchema).describe('List of event attendees'),
  reminders: z.array(reminderSchema).describe('Custom reminder overrides'),
  uses_default_reminders: z.boolean().describe('Whether this event uses the calendar default reminders'),
  color_id: z.string().describe('Color ID for the event'),
  transparency: z.string().describe('Whether the event blocks time: opaque (busy) or transparent (free)'),
  visibility: z.string().describe('Visibility: default, public, private, or confidential'),
  event_type: z.string().describe('Event type: default, outOfOffice, focusTime, workingLocation, birthday, fromGmail'),
  hangout_link: z.string().describe('Google Meet video conference link'),
  conference_uri: z.string().describe('Primary conference entry point URI'),
  recurrence: z.array(z.string()).describe('RRULE, EXRULE, RDATE, or EXDATE lines for recurring events'),
});

export const calendarListEntrySchema = z.object({
  id: z.string().describe('Calendar ID (typically an email address)'),
  summary: z.string().describe('Calendar title'),
  description: z.string().describe('Calendar description'),
  location: z.string().describe('Geographic location'),
  time_zone: z.string().describe('IANA time zone'),
  color_id: z.string().describe('Color ID'),
  background_color: z.string().describe('Background color hex code'),
  foreground_color: z.string().describe('Foreground (text) color hex code'),
  selected: z.boolean().describe('Whether the calendar is shown in the UI'),
  access_role: z.string().describe('Access role: freeBusyReader, reader, writer, or owner'),
  is_primary: z.boolean().describe('Whether this is the primary calendar'),
});

export const calendarSchema = z.object({
  id: z.string().describe('Calendar ID'),
  summary: z.string().describe('Calendar title'),
  description: z.string().describe('Calendar description'),
  location: z.string().describe('Geographic location'),
  time_zone: z.string().describe('IANA time zone'),
});

export const settingSchema = z.object({
  id: z.string().describe('Setting ID (e.g., "timezone", "locale", "dateFieldOrder")'),
  value: z.string().describe('Setting value'),
});

export const colorEntrySchema = z.object({
  id: z.string().describe('Color ID'),
  background: z.string().describe('Background color hex code'),
  foreground: z.string().describe('Foreground color hex code'),
});

// --- Defensive mappers ---

const mapDateTime = (dt?: RawDateTime) => ({
  date_time: dt?.dateTime ?? '',
  date: dt?.date ?? '',
  time_zone: dt?.timeZone ?? '',
});

const mapAttendee = (a: RawAttendee) => ({
  email: a.email ?? '',
  display_name: a.displayName ?? '',
  response_status: a.responseStatus ?? 'needsAction',
  is_self: a.self ?? false,
  is_organizer: a.organizer ?? false,
  is_optional: a.optional ?? false,
});

const mapReminder = (r: RawReminder) => ({
  method: r.method ?? 'popup',
  minutes: r.minutes ?? 0,
});

export const mapEvent = (e: RawEvent) => ({
  id: e.id ?? '',
  status: e.status ?? 'confirmed',
  html_url: e.htmlLink ?? '',
  summary: e.summary ?? '',
  description: e.description ?? '',
  location: e.location ?? '',
  creator_email: e.creator?.email ?? '',
  organizer_email: e.organizer?.email ?? '',
  start: mapDateTime(e.start),
  end: mapDateTime(e.end),
  created_at: e.created ?? '',
  updated_at: e.updated ?? '',
  recurring_event_id: e.recurringEventId ?? '',
  attendees: (e.attendees ?? []).map(mapAttendee),
  reminders: (e.reminders?.overrides ?? []).map(mapReminder),
  uses_default_reminders: e.reminders?.useDefault ?? true,
  color_id: e.colorId ?? '',
  transparency: e.transparency ?? 'opaque',
  visibility: e.visibility ?? 'default',
  event_type: e.eventType ?? 'default',
  hangout_link: e.hangoutLink ?? '',
  conference_uri: e.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ?? '',
  recurrence: e.recurrence ?? [],
});

export const mapCalendarListEntry = (c: RawCalendarListEntry) => ({
  id: c.id ?? '',
  summary: c.summary ?? '',
  description: c.description ?? '',
  location: c.location ?? '',
  time_zone: c.timeZone ?? '',
  color_id: c.colorId ?? '',
  background_color: c.backgroundColor ?? '',
  foreground_color: c.foregroundColor ?? '',
  selected: c.selected ?? false,
  access_role: c.accessRole ?? '',
  is_primary: c.primary ?? false,
});

export const mapCalendar = (c: RawCalendar) => ({
  id: c.id ?? '',
  summary: c.summary ?? '',
  description: c.description ?? '',
  location: c.location ?? '',
  time_zone: c.timeZone ?? '',
});

export const mapSetting = (s: RawSetting) => ({
  id: s.id ?? '',
  value: s.value ?? '',
});

export const mapColorEntry = (id: string, c: RawColorDefinition) => ({
  id,
  background: c.background ?? '',
  foreground: c.foreground ?? '',
});
