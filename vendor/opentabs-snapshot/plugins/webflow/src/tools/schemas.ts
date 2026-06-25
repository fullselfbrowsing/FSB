import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  email: z.string().describe('Email address'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  username: z.string().describe('Username'),
  verified: z.boolean().describe('Whether the email is verified'),
  created_on: z.string().describe('Account creation ISO 8601 timestamp'),
  plan: z.string().describe('Current plan name'),
  two_factor_enabled: z.boolean().describe('Whether 2FA is enabled'),
});

export interface RawUser {
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  verified?: boolean;
  createdOn?: string;
  plan?: string;
  twoFactorEnabled?: boolean;
}

export const mapUser = (u: RawUser) => ({
  id: u._id ?? '',
  email: u.email ?? '',
  first_name: u.firstName ?? '',
  last_name: u.lastName ?? '',
  username: u.username ?? '',
  verified: u.verified ?? false,
  created_on: u.createdOn ?? '',
  plan: u.plan ?? '',
  two_factor_enabled: u.twoFactorEnabled ?? false,
});

// --- Workspace ---

export const workspaceSchema = z.object({
  id: z.string().describe('Workspace ID'),
  name: z.string().describe('Workspace name'),
  slug: z.string().describe('Workspace URL slug'),
  role: z.string().describe('Current user role in this workspace (e.g., owner, admin, member)'),
  site_count: z.number().int().describe('Number of sites in the workspace'),
  used_seats: z.number().int().describe('Number of seats used'),
  total_seats: z.number().int().describe('Total seats available'),
  created_on: z.string().describe('Workspace creation ISO 8601 timestamp'),
});

export interface RawWorkspace {
  _id?: string;
  name?: string;
  slug?: string;
  role?: string;
  siteCount?: number;
  usedSeats?: number;
  totalSeats?: number;
  createdOn?: string;
}

export const mapWorkspace = (w: RawWorkspace) => ({
  id: w._id ?? '',
  name: w.name ?? '',
  slug: w.slug ?? '',
  role: w.role ?? '',
  site_count: w.siteCount ?? 0,
  used_seats: w.usedSeats ?? 0,
  total_seats: w.totalSeats ?? 0,
  created_on: w.createdOn ?? '',
});

// --- Site ---

export const siteSchema = z.object({
  id: z.string().describe('Site ID'),
  name: z.string().describe('Site name'),
  short_name: z.string().describe('Site short name / URL slug'),
  archived: z.boolean().describe('Whether the site is archived'),
  created_on: z.string().describe('Site creation ISO 8601 timestamp'),
  last_updated: z.string().describe('Last update ISO 8601 timestamp'),
  last_published: z.string().describe('Last publish ISO 8601 timestamp or empty if never published'),
  preview_url: z.string().describe('Screenshot preview URL'),
  workspace_id: z.string().describe('Parent workspace ID'),
});

export interface RawSite {
  _id?: string;
  name?: string;
  shortName?: string;
  archived?: boolean;
  createdOn?: string;
  lastUpdated?: string;
  lastPublished?: string | null;
  previewUrl?: string;
  workspace?: string;
}

export const mapSite = (s: RawSite) => ({
  id: s._id ?? '',
  name: s.name ?? '',
  short_name: s.shortName ?? '',
  archived: s.archived ?? false,
  created_on: s.createdOn ?? '',
  last_updated: s.lastUpdated ?? '',
  last_published: s.lastPublished ?? '',
  preview_url: s.previewUrl ?? '',
  workspace_id: s.workspace ?? '',
});

// --- Member ---

export const memberSchema = z.object({
  id: z.string().describe('Member user ID'),
  email: z.string().describe('Email address'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  username: z.string().describe('Username'),
  workspace_role: z.string().describe('Role in the workspace (e.g., owner, admin, member)'),
  site_role: z.string().describe('Default site role (e.g., project_admin, designer, editor)'),
  two_factor_enabled: z.boolean().describe('Whether 2FA is enabled'),
  last_login: z.number().describe('Last login timestamp in milliseconds'),
});

export interface RawMember {
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  roles?: { workspace?: string; site?: string };
  twoFactorEnabled?: boolean;
  lastLogin?: number;
}

export const mapMember = (m: RawMember) => ({
  id: m._id ?? '',
  email: m.email ?? '',
  first_name: m.firstName ?? '',
  last_name: m.lastName ?? '',
  username: m.username ?? '',
  workspace_role: m.roles?.workspace ?? '',
  site_role: m.roles?.site ?? '',
  two_factor_enabled: m.twoFactorEnabled ?? false,
  last_login: m.lastLogin ?? 0,
});

// --- Page ---

export const pageSchema = z.object({
  id: z.string().describe('Page ID'),
  title: z.string().describe('Page title'),
  slug: z.string().describe('Page URL slug (null for index page)'),
  type: z.string().describe('Page type (e.g., page, utility)'),
  archived: z.boolean().describe('Whether the page is archived'),
  draft: z.boolean().describe('Whether the page is a draft'),
  created_on: z.string().describe('Page creation ISO 8601 timestamp'),
  last_updated: z.string().describe('Last update ISO 8601 timestamp'),
});

export interface RawPage {
  _id?: string;
  title?: string;
  slug?: string | null;
  type?: string;
  archived?: boolean;
  draft?: boolean;
  createdOn?: string;
  lastUpdated?: string;
}

export const mapPage = (p: RawPage) => ({
  id: p._id ?? '',
  title: p.title ?? '',
  slug: p.slug ?? '',
  type: p.type ?? '',
  archived: p.archived ?? false,
  draft: p.draft ?? false,
  created_on: p.createdOn ?? '',
  last_updated: p.lastUpdated ?? '',
});

// --- Domain ---

export const domainSchema = z.object({
  id: z.string().describe('Domain ID'),
  name: z.string().describe('Domain name (e.g., example.com)'),
  stage: z.string().describe('Domain stage (e.g., staging, production)'),
  has_valid_ssl: z.boolean().describe('Whether the domain has valid SSL'),
  created_on: z.string().describe('Domain creation ISO 8601 timestamp'),
});

export interface RawDomain {
  _id?: string;
  name?: string;
  stage?: string;
  hasValidSSL?: boolean;
  createdOn?: string;
}

export const mapDomain = (d: RawDomain) => ({
  id: d._id ?? '',
  name: d.name ?? '',
  stage: d.stage ?? '',
  has_valid_ssl: d.hasValidSSL ?? false,
  created_on: d.createdOn ?? '',
});

// --- Form ---

export const formSchema = z.object({
  id: z.string().describe('Form ID'),
  name: z.string().describe('Form display name'),
  slug: z.string().describe('Form slug'),
  submission_count: z.number().int().describe('Total number of submissions'),
});

export interface RawForm {
  _id?: string;
  name?: string;
  slug?: string;
  count?: number;
}

export const mapForm = (f: RawForm) => ({
  id: f._id ?? '',
  name: f.name ?? '',
  slug: f.slug ?? '',
  submission_count: f.count ?? 0,
});

// --- Folder ---

export const folderSchema = z.object({
  id: z.string().describe('Folder ID'),
  name: z.string().describe('Folder name'),
  site_ids: z.array(z.string()).describe('IDs of sites in this folder'),
  created_on: z.string().describe('Folder creation ISO 8601 timestamp'),
});

export interface RawFolder {
  _id?: string;
  name?: string;
  sites?: string[];
  createdOn?: string;
}

export const mapFolder = (f: RawFolder) => ({
  id: f._id ?? '',
  name: f.name ?? '',
  site_ids: f.sites ?? [],
  created_on: f.createdOn ?? '',
});

// --- Invite ---

export const inviteSchema = z.object({
  id: z.string().describe('Invite ID'),
  email: z.string().describe('Invited email address'),
  status: z.string().describe('Invite status'),
  workspace_role: z.string().describe('Invited workspace role'),
});

export interface RawInvite {
  _id?: string;
  email?: string;
  status?: string;
  role?: string;
}

export const mapInvite = (i: RawInvite) => ({
  id: i._id ?? '',
  email: i.email ?? '',
  status: i.status ?? '',
  workspace_role: i.role ?? '',
});

// --- Permissions ---

export const permissionGroupSchema = z
  .record(z.string(), z.boolean())
  .describe('Permission actions and their enabled status');

export const permissionsOutputSchema = z.object({
  permissions: z.record(z.string(), permissionGroupSchema).describe('Permission groups with their action flags'),
});
