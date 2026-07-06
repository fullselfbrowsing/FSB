import { z } from 'zod';

// --- Pagination ---

export const paginationInput = z.object({
  limit: z.number().int().min(1).max(100).optional().describe('Results per page (default 100, max 100)'),
  offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
});

export const paginationOutput = z.object({
  count: z.number().describe('Total number of results'),
  has_next: z.boolean().describe('Whether more results are available'),
});

// --- User ---

export const userSchema = z.object({
  id: z.number().describe('User ID'),
  uuid: z.string().describe('User UUID'),
  email: z.string().describe('Email address'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  distinct_id: z.string().describe('Distinct ID for PostHog tracking'),
});

export interface RawUser {
  id?: number;
  uuid?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  distinct_id?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? 0,
  uuid: u.uuid ?? '',
  email: u.email ?? '',
  first_name: u.first_name ?? '',
  last_name: u.last_name ?? '',
  distinct_id: u.distinct_id ?? '',
});

// --- Created By (compact user ref) ---

export const createdBySchema = z.object({
  id: z.number().describe('Creator user ID'),
  first_name: z.string().describe('Creator first name'),
  email: z.string().describe('Creator email'),
});

export interface RawCreatedBy {
  id?: number;
  first_name?: string;
  email?: string;
}

export const mapCreatedBy = (c: RawCreatedBy | null | undefined) => {
  if (!c) return null;
  return {
    id: c.id ?? 0,
    first_name: c.first_name ?? '',
    email: c.email ?? '',
  };
};

// --- Organization ---

export const organizationSchema = z.object({
  id: z.string().describe('Organization UUID'),
  name: z.string().describe('Organization name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  membership_level: z.number().describe('Current user membership level (1=member, 8=admin, 15=owner)'),
});

export interface RawOrganization {
  id?: string;
  name?: string;
  created_at?: string;
  membership_level?: number;
}

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? '',
  name: o.name ?? '',
  created_at: o.created_at ?? '',
  membership_level: o.membership_level ?? 0,
});

// --- Project ---

export const projectSchema = z.object({
  id: z.number().describe('Project ID (also used as team_id and environment_id)'),
  uuid: z.string().describe('Project UUID'),
  name: z.string().describe('Project name'),
  api_token: z.string().describe('Project API token for event ingestion'),
  timezone: z.string().describe('Project timezone (e.g., "UTC")'),
  is_demo: z.boolean().describe('Whether this is a demo project'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawProject {
  id?: number;
  uuid?: string;
  name?: string;
  api_token?: string;
  timezone?: string;
  is_demo?: boolean;
  created_at?: string;
}

export const mapProject = (p: RawProject) => ({
  id: p.id ?? 0,
  uuid: p.uuid ?? '',
  name: p.name ?? '',
  api_token: p.api_token ?? '',
  timezone: p.timezone ?? '',
  is_demo: p.is_demo ?? false,
  created_at: p.created_at ?? '',
});

// --- Dashboard ---

export const dashboardSchema = z.object({
  id: z.number().describe('Dashboard ID'),
  name: z.string().describe('Dashboard name'),
  description: z.string().describe('Dashboard description'),
  pinned: z.boolean().describe('Whether the dashboard is pinned'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the dashboard'),
  is_shared: z.boolean().describe('Whether the dashboard is shared externally'),
  tags: z.array(z.string()).describe('Tags attached to the dashboard'),
  tiles_count: z.number().describe('Number of tiles on the dashboard'),
  deleted: z.boolean().describe('Whether the dashboard is deleted'),
});

export interface RawDashboard {
  id?: number;
  name?: string;
  description?: string;
  pinned?: boolean;
  created_at?: string;
  created_by?: RawCreatedBy | null;
  is_shared?: boolean;
  tags?: string[];
  tiles?: unknown[];
  deleted?: boolean;
}

export const mapDashboard = (d: RawDashboard) => ({
  id: d.id ?? 0,
  name: d.name ?? '',
  description: d.description ?? '',
  pinned: d.pinned ?? false,
  created_at: d.created_at ?? '',
  created_by: mapCreatedBy(d.created_by),
  is_shared: d.is_shared ?? false,
  tags: d.tags ?? [],
  tiles_count: d.tiles?.length ?? 0,
  deleted: d.deleted ?? false,
});

// --- Insight ---

export const insightSchema = z.object({
  id: z.number().describe('Insight ID'),
  short_id: z.string().describe('Short ID for URL sharing'),
  name: z.string().describe('Insight name'),
  derived_name: z.string().nullable().describe('Auto-generated name if no explicit name set'),
  description: z.string().describe('Insight description'),
  favorited: z.boolean().describe('Whether the current user has favorited this insight'),
  tags: z.array(z.string()).describe('Tags attached to the insight'),
  dashboards: z.array(z.number()).describe('IDs of dashboards this insight appears on'),
  query_kind: z.string().describe('Top-level query kind (e.g., "InsightVizNode")'),
  source_kind: z.string().describe('Source query kind (e.g., "TrendsQuery", "FunnelsQuery")'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the insight'),
  last_modified_at: z.string().describe('ISO 8601 last modification timestamp'),
  deleted: z.boolean().describe('Whether the insight is deleted'),
});

export interface RawInsight {
  id?: number;
  short_id?: string;
  name?: string;
  derived_name?: string | null;
  description?: string;
  favorited?: boolean;
  tags?: string[];
  dashboards?: number[];
  query?: { kind?: string; source?: { kind?: string } };
  created_at?: string;
  created_by?: RawCreatedBy | null;
  last_modified_at?: string;
  deleted?: boolean;
}

export const mapInsight = (i: RawInsight) => ({
  id: i.id ?? 0,
  short_id: i.short_id ?? '',
  name: i.name ?? '',
  derived_name: i.derived_name ?? null,
  description: i.description ?? '',
  favorited: i.favorited ?? false,
  tags: i.tags ?? [],
  dashboards: i.dashboards ?? [],
  query_kind: i.query?.kind ?? '',
  source_kind: i.query?.source?.kind ?? '',
  created_at: i.created_at ?? '',
  created_by: mapCreatedBy(i.created_by),
  last_modified_at: i.last_modified_at ?? '',
  deleted: i.deleted ?? false,
});

// --- Feature Flag ---

export const featureFlagSchema = z.object({
  id: z.number().describe('Feature flag ID'),
  key: z.string().describe('Feature flag key used in code'),
  name: z.string().describe('Human-readable feature flag name'),
  active: z.boolean().describe('Whether the flag is currently active'),
  deleted: z.boolean().describe('Whether the flag is deleted'),
  ensure_experience_continuity: z.boolean().describe('Whether to persist flag value per user'),
  rollout_percentage: z.number().nullable().describe('Rollout percentage (0-100) if set'),
  tags: z.array(z.string()).describe('Tags attached to the flag'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the flag'),
});

export interface RawFeatureFlag {
  id?: number;
  key?: string;
  name?: string;
  active?: boolean;
  deleted?: boolean;
  ensure_experience_continuity?: boolean;
  filters?: { groups?: Array<{ rollout_percentage?: number | null }> };
  tags?: string[];
  created_at?: string;
  created_by?: RawCreatedBy | null;
}

export const mapFeatureFlag = (f: RawFeatureFlag) => ({
  id: f.id ?? 0,
  key: f.key ?? '',
  name: f.name ?? '',
  active: f.active ?? false,
  deleted: f.deleted ?? false,
  ensure_experience_continuity: f.ensure_experience_continuity ?? false,
  rollout_percentage: f.filters?.groups?.[0]?.rollout_percentage ?? null,
  tags: f.tags ?? [],
  created_at: f.created_at ?? '',
  created_by: mapCreatedBy(f.created_by),
});

// --- Experiment ---

export const experimentSchema = z.object({
  id: z.number().describe('Experiment ID'),
  name: z.string().describe('Experiment name'),
  description: z.string().describe('Experiment description'),
  start_date: z.string().nullable().describe('ISO 8601 start timestamp'),
  end_date: z.string().nullable().describe('ISO 8601 end timestamp'),
  feature_flag_key: z.string().describe('Key of the associated feature flag'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the experiment'),
  type: z.string().describe('Experiment type (e.g., "product", "web")'),
});

export interface RawExperiment {
  id?: number;
  name?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  feature_flag_key?: string;
  created_at?: string;
  created_by?: RawCreatedBy | null;
  type?: string;
}

export const mapExperiment = (e: RawExperiment) => ({
  id: e.id ?? 0,
  name: e.name ?? '',
  description: e.description ?? '',
  start_date: e.start_date ?? null,
  end_date: e.end_date ?? null,
  feature_flag_key: e.feature_flag_key ?? '',
  created_at: e.created_at ?? '',
  created_by: mapCreatedBy(e.created_by),
  type: e.type ?? '',
});

// --- Annotation ---

export const annotationSchema = z.object({
  id: z.number().describe('Annotation ID'),
  content: z.string().describe('Annotation text content'),
  date_marker: z.string().describe('ISO 8601 timestamp the annotation marks'),
  scope: z.string().describe('Annotation scope (project, organization, or dashboard_item)'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the annotation'),
});

export interface RawAnnotation {
  id?: number;
  content?: string;
  date_marker?: string;
  scope?: string;
  created_at?: string;
  created_by?: RawCreatedBy | null;
}

export const mapAnnotation = (a: RawAnnotation) => ({
  id: a.id ?? 0,
  content: a.content ?? '',
  date_marker: a.date_marker ?? '',
  scope: a.scope ?? '',
  created_at: a.created_at ?? '',
  created_by: mapCreatedBy(a.created_by),
});

// --- Person ---

export const personSchema = z.object({
  id: z.number().describe('Person internal ID'),
  uuid: z.string().describe('Person UUID'),
  name: z.string().describe('Person display name (derived from properties)'),
  distinct_ids: z.array(z.string()).describe('Distinct IDs associated with this person'),
  properties: z.record(z.string(), z.unknown()).describe('Person properties as key-value pairs'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawPerson {
  id?: number;
  uuid?: string;
  name?: string;
  distinct_ids?: string[];
  properties?: Record<string, unknown>;
  created_at?: string;
}

export const mapPerson = (p: RawPerson) => ({
  id: p.id ?? 0,
  uuid: p.uuid ?? '',
  name: p.name ?? '',
  distinct_ids: p.distinct_ids ?? [],
  properties: p.properties ?? {},
  created_at: p.created_at ?? '',
});

// --- Cohort ---

export const cohortSchema = z.object({
  id: z.number().describe('Cohort ID'),
  name: z.string().describe('Cohort name'),
  description: z.string().describe('Cohort description'),
  count: z.number().nullable().describe('Number of persons in the cohort'),
  is_static: z.boolean().describe('Whether this is a static cohort (vs dynamic)'),
  is_calculating: z.boolean().describe('Whether the cohort is currently being recalculated'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the cohort'),
});

export interface RawCohort {
  id?: number;
  name?: string;
  description?: string;
  count?: number | null;
  is_static?: boolean;
  is_calculating?: boolean;
  created_at?: string;
  created_by?: RawCreatedBy | null;
}

export const mapCohort = (c: RawCohort) => ({
  id: c.id ?? 0,
  name: c.name ?? '',
  description: c.description ?? '',
  count: c.count ?? null,
  is_static: c.is_static ?? false,
  is_calculating: c.is_calculating ?? false,
  created_at: c.created_at ?? '',
  created_by: mapCreatedBy(c.created_by),
});

// --- Survey ---

export const surveySchema = z.object({
  id: z.string().describe('Survey UUID'),
  name: z.string().describe('Survey name'),
  description: z.string().describe('Survey description'),
  type: z.string().describe('Survey type (popover, button, full_screen, email, api)'),
  start_date: z.string().nullable().describe('ISO 8601 start timestamp'),
  end_date: z.string().nullable().describe('ISO 8601 end timestamp'),
  archived: z.boolean().describe('Whether the survey is archived'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawSurvey {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  start_date?: string | null;
  end_date?: string | null;
  archived?: boolean;
  created_at?: string;
}

export const mapSurvey = (s: RawSurvey) => ({
  id: s.id ?? '',
  name: s.name ?? '',
  description: s.description ?? '',
  type: s.type ?? '',
  start_date: s.start_date ?? null,
  end_date: s.end_date ?? null,
  archived: s.archived ?? false,
  created_at: s.created_at ?? '',
});

// --- Action ---

export const actionSchema = z.object({
  id: z.number().describe('Action ID'),
  name: z.string().describe('Action name'),
  description: z.string().describe('Action description'),
  tags: z.array(z.string()).describe('Tags attached to the action'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  created_by: createdBySchema.nullable().describe('User who created the action'),
  is_calculating: z.boolean().describe('Whether the action is currently being calculated'),
});

export interface RawAction {
  id?: number;
  name?: string;
  description?: string;
  tags?: string[];
  created_at?: string;
  created_by?: RawCreatedBy | null;
  is_calculating?: boolean;
}

export const mapAction = (a: RawAction) => ({
  id: a.id ?? 0,
  name: a.name ?? '',
  description: a.description ?? '',
  tags: a.tags ?? [],
  created_at: a.created_at ?? '',
  created_by: mapCreatedBy(a.created_by),
  is_calculating: a.is_calculating ?? false,
});

// --- Event ---

export const eventSchema = z.object({
  id: z.string().describe('Event UUID'),
  event: z.string().describe('Event name (e.g., "$pageview", "user_signed_up")'),
  distinct_id: z.string().describe('Distinct ID of the person who triggered the event'),
  timestamp: z.string().describe('ISO 8601 event timestamp'),
  properties: z.record(z.string(), z.unknown()).describe('Event properties as key-value pairs'),
});

export interface RawEvent {
  id?: string;
  event?: string;
  distinct_id?: string;
  timestamp?: string;
  properties?: Record<string, unknown>;
}

export const mapEvent = (e: RawEvent) => ({
  id: e.id ?? '',
  event: e.event ?? '',
  distinct_id: e.distinct_id ?? '',
  timestamp: e.timestamp ?? '',
  properties: e.properties ?? {},
});

// --- Event Definition ---

export const eventDefinitionSchema = z.object({
  id: z.string().describe('Event definition UUID'),
  name: z.string().describe('Event name'),
  volume_30_day: z.number().nullable().describe('Event count in the last 30 days'),
  query_usage_30_day: z.number().nullable().describe('Number of queries using this event in the last 30 days'),
  last_seen_at: z.string().nullable().describe('ISO 8601 timestamp of the last time this event was seen'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawEventDefinition {
  id?: string;
  name?: string;
  volume_30_day?: number | null;
  query_usage_30_day?: number | null;
  last_seen_at?: string | null;
  created_at?: string;
}

export const mapEventDefinition = (d: RawEventDefinition) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  volume_30_day: d.volume_30_day ?? null,
  query_usage_30_day: d.query_usage_30_day ?? null,
  last_seen_at: d.last_seen_at ?? null,
  created_at: d.created_at ?? '',
});

// --- Property Definition ---

export const propertyDefinitionSchema = z.object({
  id: z.string().describe('Property definition UUID'),
  name: z.string().describe('Property name (e.g., "$browser", "plan_name")'),
  property_type: z.string().nullable().describe('Property type: String, Numeric, Boolean, DateTime'),
  is_numerical: z.boolean().describe('Whether the property holds numeric values'),
});

export interface RawPropertyDefinition {
  id?: string;
  name?: string;
  property_type?: string | null;
  is_numerical?: boolean;
}

export const mapPropertyDefinition = (d: RawPropertyDefinition) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  property_type: d.property_type ?? null,
  is_numerical: d.is_numerical ?? false,
});

// --- Paginated API response envelope ---

export interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
}
