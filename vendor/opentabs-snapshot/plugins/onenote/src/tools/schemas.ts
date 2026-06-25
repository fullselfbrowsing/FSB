import { z } from 'zod';

// --- Identity info (shared by createdBy / lastModifiedBy) ---

export const identitySchema = z.object({
  id: z.string().describe('User ID'),
  display_name: z.string().describe('User display name'),
});

export interface RawIdentitySet {
  user?: { id?: string; displayName?: string };
}

export const mapIdentity = (i: RawIdentitySet | undefined) => ({
  id: i?.user?.id ?? '',
  display_name: i?.user?.displayName ?? '',
});

// --- Notebook ---

export const notebookSchema = z.object({
  id: z.string().describe('Notebook ID'),
  display_name: z.string().describe('Notebook name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  last_modified_at: z.string().describe('ISO 8601 last modified timestamp'),
  is_default: z.boolean().describe('Whether this is the default notebook'),
  is_shared: z.boolean().describe('Whether the notebook is shared'),
  user_role: z.string().describe('User role (e.g., Owner, Contributor, Reader)'),
  sections_url: z.string().describe('URL to list sections in this notebook'),
  section_groups_url: z.string().describe('URL to list section groups in this notebook'),
  created_by: identitySchema.describe('User who created the notebook'),
  last_modified_by: identitySchema.describe('User who last modified the notebook'),
  web_url: z.string().describe('URL to open the notebook in OneNote Online'),
});

export interface RawNotebook {
  id?: string;
  displayName?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  isDefault?: boolean;
  isShared?: boolean;
  userRole?: string;
  sectionsUrl?: string;
  sectionGroupsUrl?: string;
  createdBy?: RawIdentitySet;
  lastModifiedBy?: RawIdentitySet;
  links?: { oneNoteWebUrl?: { href?: string } };
}

export const mapNotebook = (n: RawNotebook) => ({
  id: n.id ?? '',
  display_name: n.displayName ?? '',
  created_at: n.createdDateTime ?? '',
  last_modified_at: n.lastModifiedDateTime ?? '',
  is_default: n.isDefault ?? false,
  is_shared: n.isShared ?? false,
  user_role: n.userRole ?? '',
  sections_url: n.sectionsUrl ?? '',
  section_groups_url: n.sectionGroupsUrl ?? '',
  created_by: mapIdentity(n.createdBy),
  last_modified_by: mapIdentity(n.lastModifiedBy),
  web_url: n.links?.oneNoteWebUrl?.href ?? '',
});

// --- Recent Notebook ---

export const recentNotebookSchema = z.object({
  display_name: z.string().describe('Notebook name'),
  last_accessed_time: z.string().describe('ISO 8601 timestamp of last access'),
  source_service: z.string().describe('Source service (e.g., OneDriveForBusiness, OneDrive)'),
  web_url: z.string().describe('URL to open the notebook in OneNote Online'),
});

export interface RawRecentNotebook {
  displayName?: string;
  lastAccessedTime?: string;
  sourceService?: string;
  links?: { oneNoteWebUrl?: { href?: string } };
}

export const mapRecentNotebook = (n: RawRecentNotebook) => ({
  display_name: n.displayName ?? '',
  last_accessed_time: n.lastAccessedTime ?? '',
  source_service: n.sourceService ?? '',
  web_url: n.links?.oneNoteWebUrl?.href ?? '',
});

// --- Section ---

export const sectionSchema = z.object({
  id: z.string().describe('Section ID'),
  display_name: z.string().describe('Section name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  last_modified_at: z.string().describe('ISO 8601 last modified timestamp'),
  is_default: z.boolean().describe('Whether this is the default section'),
  pages_url: z.string().describe('URL to list pages in this section'),
  parent_notebook_id: z.string().describe('Parent notebook ID'),
  parent_notebook_name: z.string().describe('Parent notebook display name'),
  created_by: identitySchema.describe('User who created the section'),
  last_modified_by: identitySchema.describe('User who last modified the section'),
});

export interface RawSection {
  id?: string;
  displayName?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  isDefault?: boolean;
  pagesUrl?: string;
  createdBy?: RawIdentitySet;
  lastModifiedBy?: RawIdentitySet;
  parentNotebook?: { id?: string; displayName?: string };
}

export const mapSection = (s: RawSection) => ({
  id: s.id ?? '',
  display_name: s.displayName ?? '',
  created_at: s.createdDateTime ?? '',
  last_modified_at: s.lastModifiedDateTime ?? '',
  is_default: s.isDefault ?? false,
  pages_url: s.pagesUrl ?? '',
  parent_notebook_id: s.parentNotebook?.id ?? '',
  parent_notebook_name: s.parentNotebook?.displayName ?? '',
  created_by: mapIdentity(s.createdBy),
  last_modified_by: mapIdentity(s.lastModifiedBy),
});

// --- Section Group ---

export const sectionGroupSchema = z.object({
  id: z.string().describe('Section group ID'),
  display_name: z.string().describe('Section group name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  last_modified_at: z.string().describe('ISO 8601 last modified timestamp'),
  sections_url: z.string().describe('URL to list sections in this group'),
  section_groups_url: z.string().describe('URL to list nested section groups'),
  parent_notebook_id: z.string().describe('Parent notebook ID'),
  parent_notebook_name: z.string().describe('Parent notebook display name'),
  created_by: identitySchema.describe('User who created the section group'),
  last_modified_by: identitySchema.describe('User who last modified the section group'),
});

export interface RawSectionGroup {
  id?: string;
  displayName?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  sectionsUrl?: string;
  sectionGroupsUrl?: string;
  createdBy?: RawIdentitySet;
  lastModifiedBy?: RawIdentitySet;
  parentNotebook?: { id?: string; displayName?: string };
}

export const mapSectionGroup = (sg: RawSectionGroup) => ({
  id: sg.id ?? '',
  display_name: sg.displayName ?? '',
  created_at: sg.createdDateTime ?? '',
  last_modified_at: sg.lastModifiedDateTime ?? '',
  sections_url: sg.sectionsUrl ?? '',
  section_groups_url: sg.sectionGroupsUrl ?? '',
  parent_notebook_id: sg.parentNotebook?.id ?? '',
  parent_notebook_name: sg.parentNotebook?.displayName ?? '',
  created_by: mapIdentity(sg.createdBy),
  last_modified_by: mapIdentity(sg.lastModifiedBy),
});

// --- Page (create response) ---

export const pageSchema = z.object({
  id: z.string().describe('Page ID'),
  title: z.string().describe('Page title'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  last_modified_at: z.string().describe('ISO 8601 last modified timestamp'),
  web_url: z.string().describe('URL to open the page in OneNote Online'),
  content_url: z.string().describe('URL to retrieve the page HTML content'),
  parent_section_id: z.string().describe('Parent section ID'),
});

export interface RawPage {
  id?: string;
  title?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  links?: { oneNoteWebUrl?: { href?: string } };
  contentUrl?: string;
  parentSection?: { id?: string };
}

export const mapPage = (p: RawPage) => ({
  id: p.id ?? '',
  title: p.title ?? '',
  created_at: p.createdDateTime ?? '',
  last_modified_at: p.lastModifiedDateTime ?? '',
  web_url: p.links?.oneNoteWebUrl?.href ?? '',
  content_url: p.contentUrl ?? '',
  parent_section_id: p.parentSection?.id ?? '',
});

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  display_name: z.string().describe('Full display name'),
  email: z.string().describe('Email address'),
  given_name: z.string().describe('First name'),
  surname: z.string().describe('Last name'),
  preferred_language: z.string().describe('Preferred language code (e.g., en-US)'),
});

export interface RawUser {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  givenName?: string;
  surname?: string;
  preferredLanguage?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  display_name: u.displayName ?? '',
  email: u.mail ?? u.userPrincipalName ?? '',
  given_name: u.givenName ?? '',
  surname: u.surname ?? '',
  preferred_language: u.preferredLanguage ?? '',
});
