import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User login ID (email)'),
  alias: z.string().describe('User alias UUID'),
  email: z.string().describe('Email address'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  full_name: z.string().describe('Full display name'),
  org_role: z.number().int().describe('Organization role level (4=admin)'),
  org_team: z.string().nullable().describe('Organization team name'),
  title: z.string().describe('Job title'),
  pronouns: z.string().nullable().describe('Preferred pronouns'),
  has_avatar: z.boolean().describe('Whether the user has a custom avatar'),
  created_at: z.number().describe('Unix timestamp of account creation'),
  is_connected_to_slack: z.boolean().describe('Whether connected to Slack integration'),
});

export interface RawUser {
  id?: string;
  alias?: string;
  email?: string;
  loginId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  orgRole?: number;
  orgTeam?: string | null;
  title?: string;
  pronouns?: string | null;
  hasAvatar?: boolean;
  createdAt?: number;
  isConnectedToSlack?: boolean;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  alias: u.alias ?? '',
  email: u.email ?? '',
  first_name: u.firstName ?? '',
  last_name: u.lastName ?? '',
  full_name: u.fullName ?? '',
  org_role: u.orgRole ?? 0,
  org_team: u.orgTeam ?? null,
  title: u.title ?? '',
  pronouns: u.pronouns ?? null,
  has_avatar: u.hasAvatar ?? false,
  created_at: u.createdAt ?? 0,
  is_connected_to_slack: u.isConnectedToSlack ?? false,
});

// --- App (Project) ---

export const appSchema = z.object({
  id: z.string().describe('App/project numeric ID'),
  name: z.string().describe('App/project name'),
});

export interface RawApp {
  id?: string | number;
  name?: string;
}

export const mapApp = (a: RawApp) => ({
  id: String(a.id ?? ''),
  name: a.name ?? '',
});

// --- Space ---

export const spaceSchema = z.object({
  id: z.string().describe('Space ID'),
  space_id: z.string().describe('Space UUID'),
  org_id: z.string().describe('Organization ID'),
  type: z.string().describe('Space type (PERSONAL, TEAM, etc.)'),
  name: z.string().describe('Space display name'),
  description: z.string().nullable().describe('Space description'),
  is_archived: z.boolean().describe('Whether the space is archived'),
  is_deleted: z.boolean().describe('Whether the space is soft-deleted'),
  item_count: z.number().int().describe('Number of items in the space'),
  created_by: z.string().describe('Login ID of the creator'),
  created_at: z.number().describe('Unix timestamp of creation'),
  last_modified_at: z.number().describe('Unix timestamp of last modification'),
  permission_level: z.number().int().describe('Permission level'),
  public: z.boolean().describe('Whether the space is public'),
});

export interface RawSpace {
  id?: string;
  spaceId?: string;
  orgId?: string;
  type?: string;
  name?: string;
  description?: string | null;
  isArchived?: boolean;
  isDeleted?: boolean;
  itemCount?: number;
  createdBy?: string;
  createdAt?: number;
  lastModifiedAt?: number;
  permissionLevel?: number;
  public?: boolean;
}

export const mapSpace = (s: RawSpace) => ({
  id: s.id ?? '',
  space_id: s.spaceId ?? '',
  org_id: s.orgId ?? '',
  type: s.type ?? '',
  name: s.name ?? '',
  description: s.description ?? null,
  is_archived: s.isArchived ?? false,
  is_deleted: s.isDeleted ?? false,
  item_count: s.itemCount ?? 0,
  created_by: s.createdBy ?? '',
  created_at: s.createdAt ?? 0,
  last_modified_at: s.lastModifiedAt ?? 0,
  permission_level: s.permissionLevel ?? 0,
  public: s.public ?? false,
});

// --- Search Result ---

export const searchResultSchema = z.object({
  entity_id: z.string().describe('Entity ID (format: appId_entityId)'),
  name: z.string().describe('Content name'),
  description: z.string().nullable().describe('Content description'),
  type: z.string().describe('Content type (CHART, DASHBOARD, COHORT, NOTEBOOK, SPACE, NUDGE)'),
  chart_type: z.string().nullable().describe('Chart sub-type if applicable'),
  owners: z.array(z.string()).describe('Owner login IDs'),
  is_official: z.boolean().describe('Whether marked as official'),
  is_template: z.boolean().describe('Whether it is a template'),
  is_archived: z.boolean().describe('Whether archived'),
  last_modified_at: z.number().describe('Unix timestamp of last modification'),
  view_count: z.number().int().describe('Total view count'),
});

export interface RawSearchEntity {
  entityId?: string;
  name?: string;
  description?: string | null;
  type?: string;
  chartType?: string | null;
  owners?: string[];
  isOfficial?: boolean;
  isTemplate?: boolean;
  isArchived?: boolean;
  lastModifiedAt?: number;
  viewCount?: number;
}

export const mapSearchResult = (r: { entity?: RawSearchEntity }) => {
  const e = r.entity ?? {};
  return {
    entity_id: e.entityId ?? '',
    name: e.name ?? '',
    description: e.description ?? null,
    type: e.type ?? '',
    chart_type: e.chartType ?? null,
    owners: e.owners ?? [],
    is_official: e.isOfficial ?? false,
    is_template: e.isTemplate ?? false,
    is_archived: e.isArchived ?? false,
    last_modified_at: e.lastModifiedAt ?? 0,
    view_count: e.viewCount ?? 0,
  };
};

// --- Entitlement ---

export const entitlementSchema = z.object({
  type: z.string().describe('Entitlement type'),
  source: z.string().describe('Entitlement source'),
  plan: z.string().describe('Associated plan'),
  quota: z.number().describe('Quota limit'),
  quota_type: z.string().describe('Quota type'),
  start_time: z.string().describe('Start time ISO string'),
  end_time: z.string().describe('End time ISO string'),
});

export interface RawEntitlement {
  type?: string;
  source?: string;
  plan?: string;
  quota?: number;
  quotaType?: string;
  startTime?: string;
  endTime?: string;
}

export const mapEntitlement = (e: RawEntitlement) => ({
  type: e.type ?? '',
  source: e.source ?? '',
  plan: e.plan ?? '',
  quota: e.quota ?? 0,
  quota_type: e.quotaType ?? '',
  start_time: e.startTime ?? '',
  end_time: e.endTime ?? '',
});

// --- Volume ---

export const volumeSchema = z.object({
  month: z.string().describe('Month in YYYY-MM-DD format'),
  total: z.number().describe('Total count for the month'),
  billed: z.number().describe('Billed count for the month'),
});
