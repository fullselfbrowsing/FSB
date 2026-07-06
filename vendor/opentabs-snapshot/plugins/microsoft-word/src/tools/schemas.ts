import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  display_name: z.string().describe('Display name'),
  email: z.string().describe('Email address'),
});

export interface RawUser {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  display_name: u.displayName ?? '',
  email: u.mail ?? u.userPrincipalName ?? '',
});

// --- Drive ---

export const quotaSchema = z.object({
  total: z.number().describe('Total storage in bytes'),
  used: z.number().describe('Used storage in bytes'),
  remaining: z.number().describe('Remaining storage in bytes'),
  state: z.string().describe('Quota state (normal, nearing, critical, exceeded)'),
});

export const driveSchema = z.object({
  id: z.string().describe('Drive ID'),
  name: z.string().describe('Drive name'),
  drive_type: z.string().describe('Drive type (personal, business, documentLibrary)'),
  quota: quotaSchema.describe('Storage quota information'),
});

export interface RawQuota {
  total?: number;
  used?: number;
  remaining?: number;
  state?: string;
}

export interface RawDrive {
  id?: string;
  name?: string;
  driveType?: string;
  quota?: RawQuota;
}

export const mapDrive = (d: RawDrive) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  drive_type: d.driveType ?? '',
  quota: {
    total: d.quota?.total ?? 0,
    used: d.quota?.used ?? 0,
    remaining: d.quota?.remaining ?? 0,
    state: d.quota?.state ?? '',
  },
});

// --- Drive Item (file or folder) ---

export const driveItemSchema = z.object({
  id: z.string().describe('Item ID'),
  name: z.string().describe('File or folder name'),
  size: z.number().describe('Size in bytes (0 for folders)'),
  is_folder: z.boolean().describe('Whether the item is a folder'),
  mime_type: z.string().describe('MIME type (empty for folders)'),
  web_url: z.string().describe('URL to open in browser'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  last_modified_at: z.string().describe('ISO 8601 last modification timestamp'),
  parent_path: z.string().describe('Parent folder path'),
  parent_id: z.string().describe('Parent folder ID'),
  description: z.string().describe('Item description'),
});

export interface RawDriveItem {
  id?: string;
  name?: string;
  size?: number;
  folder?: Record<string, unknown>;
  file?: { mimeType?: string; hashes?: Record<string, string> };
  webUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  parentReference?: {
    driveId?: string;
    driveType?: string;
    id?: string;
    name?: string;
    path?: string;
  };
  description?: string;
}

export const mapDriveItem = (i: RawDriveItem) => ({
  id: i.id ?? '',
  name: i.name ?? '',
  size: i.size ?? 0,
  is_folder: !!i.folder,
  mime_type: i.file?.mimeType ?? '',
  web_url: i.webUrl ?? '',
  created_at: i.createdDateTime ?? '',
  last_modified_at: i.lastModifiedDateTime ?? '',
  parent_path: i.parentReference?.path ?? '',
  parent_id: i.parentReference?.id ?? '',
  description: i.description ?? '',
});

// --- Permission ---

export const permissionSchema = z.object({
  id: z.string().describe('Permission ID'),
  roles: z.array(z.string()).describe('Permission roles (read, write, owner)'),
  link_url: z.string().describe('Sharing link URL (empty if not a link permission)'),
  link_type: z.string().describe('Link type (view, edit, embed) — empty if not a link'),
  granted_to: z.string().describe('Display name of the grantee — empty if anonymous link'),
});

export interface RawPermission {
  id?: string;
  roles?: string[];
  link?: { webUrl?: string; type?: string; scope?: string };
  grantedTo?: { user?: { displayName?: string; id?: string } };
  grantedToIdentities?: Array<{ user?: { displayName?: string; id?: string } }>;
}

export const mapPermission = (p: RawPermission) => ({
  id: p.id ?? '',
  roles: p.roles ?? [],
  link_url: p.link?.webUrl ?? '',
  link_type: p.link?.type ?? '',
  granted_to: p.grantedTo?.user?.displayName ?? p.grantedToIdentities?.[0]?.user?.displayName ?? '',
});

// --- Version ---

export const versionSchema = z.object({
  id: z.string().describe('Version ID'),
  last_modified_at: z.string().describe('ISO 8601 last modification timestamp'),
  size: z.number().describe('Size in bytes'),
});

export interface RawVersion {
  id?: string;
  lastModifiedDateTime?: string;
  size?: number;
}

export const mapVersion = (v: RawVersion) => ({
  id: v.id ?? '',
  last_modified_at: v.lastModifiedDateTime ?? '',
  size: v.size ?? 0,
});
