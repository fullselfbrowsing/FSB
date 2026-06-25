import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.number().describe('User numeric ID'),
  uuid: z.string().describe('User UUID'),
  name: z.string().describe('Full name'),
  email: z.string().describe('Email address'),
  booking_url: z.string().describe('Public booking page URL'),
  avatar_url: z.string().describe('Avatar image URL (empty if none)'),
  timezone: z.string().describe('IANA timezone (e.g. "America/Los_Angeles")'),
  locale: z.string().describe('Locale code (e.g. "en")'),
  country_code: z.string().describe('Two-letter country code'),
  created_at: z.string().describe('Account creation timestamp (ISO 8601)'),
  date_notation: z.string().describe('Date display format (e.g. "american")'),
  time_notation: z.string().describe('Time display format (e.g. "12h")'),
  events_count: z.number().describe('Total number of scheduled events'),
  is_branded: z.boolean().describe('Whether the account has branding enabled'),
});

interface RawUser {
  id?: number;
  uuid?: string;
  name?: string;
  email?: string;
  booking_url?: string;
  avatar_url?: string | null;
  timezone?: string;
  locale?: string;
  country_code?: string;
  created_at?: string;
  date_notation?: string;
  time_notation?: string;
  events_count?: number;
  is_branded?: boolean;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? 0,
  uuid: u.uuid ?? '',
  name: u.name ?? '',
  email: u.email ?? '',
  booking_url: u.booking_url ?? '',
  avatar_url: u.avatar_url ?? '',
  timezone: u.timezone ?? '',
  locale: u.locale ?? '',
  country_code: u.country_code ?? '',
  created_at: u.created_at ?? '',
  date_notation: u.date_notation ?? '',
  time_notation: u.time_notation ?? '',
  events_count: u.events_count ?? 0,
  is_branded: u.is_branded ?? false,
});

// --- Organization ---

export const organizationSchema = z.object({
  id: z.number().describe('Organization numeric ID'),
  name: z.string().describe('Organization name (empty for individual accounts)'),
  kind: z.string().describe('Organization kind (e.g. "single")'),
  stage: z.string().describe('Organization stage (e.g. "trial", "active")'),
  tier: z.string().describe('Subscription tier (e.g. "teams", "professional", "free")'),
  is_trial: z.boolean().describe('Whether the organization is on a trial'),
  created_at: z.string().describe('Organization creation timestamp (ISO 8601)'),
  uri: z.string().describe('Calendly API URI for the organization'),
  owner_name: z.string().describe('Organization owner name'),
  owner_email: z.string().describe('Organization owner email'),
});

interface RawOrganization {
  id?: number;
  name?: string | null;
  kind?: string;
  stage?: string;
  tier?: string;
  is_trial?: boolean;
  created_at?: string;
  uri?: string;
  owner?: { name?: string; email?: string };
}

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? 0,
  name: o.name ?? '',
  kind: o.kind ?? '',
  stage: o.stage ?? '',
  tier: o.tier ?? '',
  is_trial: o.is_trial ?? false,
  created_at: o.created_at ?? '',
  uri: o.uri ?? '',
  owner_name: o.owner?.name ?? '',
  owner_email: o.owner?.email ?? '',
});

// --- Organization Statistics ---

export const orgStatisticsSchema = z.object({
  available_seats: z.number().describe('Number of available seats'),
  users: z.number().describe('Number of active users'),
  invitations: z.number().describe('Number of pending invitations'),
  occupancy_ratio: z.string().describe('Seat occupancy ratio (e.g. "3/5")'),
  occupancy_capacity: z.number().describe('Total seat capacity'),
});

interface RawOrgStatistics {
  available_seats?: number;
  users?: number;
  invitations?: number;
  occupancy_ratio?: string;
  occupancy_capacity?: number;
}

export const mapOrgStatistics = (s: RawOrgStatistics) => ({
  available_seats: s.available_seats ?? 0,
  users: s.users ?? 0,
  invitations: s.invitations ?? 0,
  occupancy_ratio: s.occupancy_ratio ?? '',
  occupancy_capacity: s.occupancy_capacity ?? 0,
});

// --- Event Type ---

export const locationConfigSchema = z.object({
  id: z.number().describe('Location configuration ID'),
  kind: z.string().describe('Location type (e.g. "google_conference", "in_person", "phone")'),
  position: z.number().describe('Display position'),
  location: z.string().describe('Location address or URL (empty if auto-generated)'),
});

export const customFieldSchema = z.object({
  id: z.number().describe('Custom field ID'),
  name: z.string().describe('Field label displayed to invitees'),
  format: z.string().describe('Field type (e.g. "text", "phone_number", "single_select")'),
  required: z.boolean().describe('Whether the field is required'),
  enabled: z.boolean().describe('Whether the field is active'),
  position: z.number().describe('Display order'),
});

export const eventTypeSchema = z.object({
  id: z.number().describe('Event type numeric ID'),
  uuid: z.string().describe('Event type UUID'),
  name: z.string().describe('Event type name (e.g. "30 Minute Meeting")'),
  slug: z.string().describe('URL-safe slug (e.g. "30min")'),
  description: z.string().describe('Description shown to invitees'),
  duration_minutes: z.number().describe('Duration in minutes'),
  kind: z.string().describe('Event kind (e.g. "solo", "group", "round_robin")'),
  type: z.string().describe('Event type class (e.g. "StandardEventType")'),
  color: z.string().describe('Display color hex code'),
  active: z.boolean().describe('Whether the event type is currently active'),
  public: z.boolean().describe('Whether the event type is publicly visible'),
  booking_url: z.string().describe('Public booking URL'),
  location_configurations: z.array(locationConfigSchema).describe('Meeting location options'),
  custom_fields: z.array(customFieldSchema).describe('Custom intake questions'),
  invitees_limit: z.number().describe('Maximum number of invitees (1 for solo events)'),
  owner_name: z.string().describe('Name of the event type owner'),
});

interface RawLocationConfig {
  id?: number;
  kind?: string;
  position?: number;
  location?: string | null;
}

interface RawCustomField {
  id?: number;
  name?: string;
  format?: string;
  required?: boolean;
  enabled?: boolean;
  position?: number;
}

interface RawEventType {
  id?: number;
  uuid?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  duration_minutes?: number;
  duration?: number;
  kind?: string;
  type?: string;
  color?: string;
  active?: boolean;
  public?: boolean;
  booking_url?: string;
  location_configurations?: RawLocationConfig[];
  custom_fields?: RawCustomField[];
  invitees_limit?: number;
  profile?: { name?: string };
  owning_user_name?: string;
}

const mapLocationConfig = (l: RawLocationConfig) => ({
  id: l.id ?? 0,
  kind: l.kind ?? '',
  position: l.position ?? 0,
  location: l.location ?? '',
});

const mapCustomField = (f: RawCustomField) => ({
  id: f.id ?? 0,
  name: f.name ?? '',
  format: f.format ?? '',
  required: f.required ?? false,
  enabled: f.enabled ?? false,
  position: f.position ?? 0,
});

export const mapEventType = (et: RawEventType) => ({
  id: et.id ?? 0,
  uuid: et.uuid ?? '',
  name: et.name ?? '',
  slug: et.slug ?? '',
  description: et.description ?? '',
  duration_minutes: et.duration_minutes ?? et.duration ?? 0,
  kind: et.kind ?? '',
  type: et.type ?? '',
  color: et.color ?? '',
  active: et.active ?? false,
  public: et.public ?? false,
  booking_url: et.booking_url ?? '',
  location_configurations: (et.location_configurations ?? []).map(mapLocationConfig),
  custom_fields: (et.custom_fields ?? []).map(mapCustomField),
  invitees_limit: et.invitees_limit ?? 1,
  owner_name: et.owning_user_name ?? et.profile?.name ?? '',
});

// --- Scheduled Event ---
// The API returns events grouped by date: { date, raw_date, events: [...] }
// Each event has nested invitee, event_type, and external_location objects.

export const scheduledEventSchema = z.object({
  id: z.number().describe('Scheduled event numeric ID'),
  uuid: z.string().describe('Scheduled event UUID'),
  name: z.string().describe('Event name (from the event type)'),
  cancelled: z.boolean().describe('Whether the event has been cancelled'),
  start_time: z.string().describe('Event start time (ISO 8601)'),
  end_time: z.string().describe('Event end time (ISO 8601)'),
  location_type: z.string().describe('Location type (e.g. "google_conference", "in_person")'),
  join_url: z.string().describe('Video conference join URL (empty if not applicable)'),
  event_type_name: z.string().describe('Name of the associated event type'),
  event_type_id: z.number().describe('Associated event type numeric ID'),
  invitee_name: z.string().describe('Primary invitee name'),
  invitee_email: z.string().describe('Primary invitee email'),
  scheduled_at: z.string().describe('When the event was scheduled (ISO 8601)'),
});

interface RawScheduledEvent {
  id?: number;
  uuid?: string;
  name?: string;
  cancelled?: boolean;
  start_time?: string;
  end_time?: string;
  location_type?: string;
  external_location?: { join_url?: string; kind?: string };
  event_type?: { id?: number; name?: string };
  invitee?: { name?: string; email?: string };
  scheduled_at?: string;
}

export const mapScheduledEvent = (e: RawScheduledEvent) => ({
  id: e.id ?? 0,
  uuid: e.uuid ?? '',
  name: e.name ?? '',
  cancelled: e.cancelled ?? false,
  start_time: e.start_time ?? '',
  end_time: e.end_time ?? '',
  location_type: e.location_type ?? '',
  join_url: e.external_location?.join_url ?? '',
  event_type_name: e.event_type?.name ?? '',
  event_type_id: e.event_type?.id ?? 0,
  invitee_name: e.invitee?.name ?? '',
  invitee_email: e.invitee?.email ?? '',
  scheduled_at: e.scheduled_at ?? '',
});

// --- Calendar Account ---

export const calendarSchema = z.object({
  id: z.string().describe('Calendar ID'),
  name: z.string().describe('Calendar name'),
  write_access: z.boolean().describe('Whether the calendar has write access'),
});

export const calendarAccountSchema = z.object({
  uuid: z.string().describe('Calendar account UUID'),
  kind: z.string().describe('Provider kind (e.g. "google", "outlook")'),
  name: z.string().describe('Provider display name (e.g. "Google Calendar")'),
  email: z.string().describe('Email address associated with this calendar account'),
  pull_enabled: z.boolean().describe('Whether conflict checking is enabled'),
  push_enabled: z.boolean().describe('Whether new events are added to this calendar'),
  calendars: z.array(calendarSchema).describe('Sub-calendars in this account'),
});

interface RawCalendar {
  id?: string;
  name?: string;
  write_access?: boolean;
}

interface RawCalendarAccount {
  uuid?: string;
  kind?: string;
  name?: string;
  email?: string;
  pull_enabled?: boolean;
  push_enabled?: boolean;
  calendars?: RawCalendar[];
}

const mapCalendar = (c: RawCalendar) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  write_access: c.write_access ?? false,
});

export const mapCalendarAccount = (a: RawCalendarAccount) => ({
  uuid: a.uuid ?? '',
  kind: a.kind ?? '',
  name: a.name ?? '',
  email: a.email ?? '',
  pull_enabled: a.pull_enabled ?? false,
  push_enabled: a.push_enabled ?? false,
  calendars: (a.calendars ?? []).map(mapCalendar),
});

// --- Busy Time ---

export const busyTimeSchema = z.object({
  type: z.string().describe('Busy time type (e.g. "calendly", "external")'),
  start_time: z.string().describe('Start time (ISO 8601)'),
  end_time: z.string().describe('End time (ISO 8601)'),
});

interface RawBusyTime {
  type?: string;
  start_time?: string;
  end_time?: string;
}

export const mapBusyTime = (b: RawBusyTime) => ({
  type: b.type ?? '',
  start_time: b.start_time ?? '',
  end_time: b.end_time ?? '',
});

// --- Pagination ---

export const paginationSchema = z.object({
  total_count: z.number().describe('Total number of results'),
  current_page: z.number().describe('Current page number (1-indexed)'),
  total_pages: z.number().describe('Total number of pages'),
  has_next_page: z.boolean().describe('Whether there is a next page'),
});

interface RawPagination {
  total_count?: number;
  current_page?: number;
  total_pages?: number;
  next_page?: number | null;
}

export const mapPagination = (p: RawPagination) => ({
  total_count: p.total_count ?? 0,
  current_page: p.current_page ?? 1,
  total_pages: p.total_pages ?? 0,
  has_next_page: p.next_page != null,
});
