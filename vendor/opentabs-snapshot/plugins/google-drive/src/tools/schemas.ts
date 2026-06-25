import { z } from 'zod';

// --- File fields requested from the API ---

export const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,createdTime,size,parents,trashed,starred,shared,webViewLink,iconLink,description,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress)';

export const FILE_LIST_FIELDS = `nextPageToken,files(${FILE_FIELDS})`;

// --- Raw API response types ---

export interface RawUser {
  displayName?: string;
  emailAddress?: string;
  kind?: string;
  me?: boolean;
  permissionId?: string;
  photoLink?: string;
}

export interface RawFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  starred?: boolean;
  shared?: boolean;
  webViewLink?: string;
  iconLink?: string;
  description?: string;
  owners?: RawUser[];
  lastModifyingUser?: RawUser;
}

export interface RawPermission {
  id?: string;
  type?: string;
  role?: string;
  emailAddress?: string;
  displayName?: string;
  domain?: string;
}

export interface RawAbout {
  user?: RawUser;
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
    usageInDriveTrash?: string;
  };
}

// --- Zod output schemas ---

export const userSchema = z.object({
  display_name: z.string().describe('User display name'),
  email: z.string().describe('User email address'),
  permission_id: z.string().describe('User permission ID'),
  photo_link: z.string().describe('URL to user profile photo'),
});

export const storageQuotaSchema = z.object({
  limit_bytes: z.string().describe('Total storage limit in bytes'),
  usage_bytes: z.string().describe('Total storage usage in bytes'),
  usage_in_drive_bytes: z.string().describe('Storage used by Drive files in bytes'),
  usage_in_trash_bytes: z.string().describe('Storage used by trashed files in bytes'),
});

export const fileSchema = z.object({
  id: z.string().describe('File ID'),
  name: z.string().describe('File name'),
  mime_type: z
    .string()
    .describe(
      'MIME type (e.g., "application/vnd.google-apps.document" for Google Docs, "application/vnd.google-apps.folder" for folders)',
    ),
  modified_time: z.string().describe('Last modified time in ISO 8601 format'),
  created_time: z.string().describe('Creation time in ISO 8601 format'),
  size: z.string().describe('File size in bytes (empty for Google Workspace files)'),
  parent_id: z.string().describe('Parent folder ID'),
  trashed: z.boolean().describe('Whether the file is in the trash'),
  starred: z.boolean().describe('Whether the file is starred'),
  shared: z.boolean().describe('Whether the file is shared with others'),
  web_view_link: z.string().describe('URL to open the file in a browser'),
  description: z.string().describe('File description'),
  owner: z.string().describe('File owner display name'),
  owner_email: z.string().describe('File owner email address'),
  last_modified_by: z.string().describe('Last modifier display name'),
});

export const permissionSchema = z.object({
  id: z.string().describe('Permission ID'),
  type: z.string().describe('Permission type: "user", "group", "domain", or "anyone"'),
  role: z
    .string()
    .describe('Permission role: "owner", "organizer", "fileOrganizer", "writer", "commenter", or "reader"'),
  email: z.string().describe('Email address of the grantee (for user/group types)'),
  display_name: z.string().describe('Display name of the grantee'),
  domain: z.string().describe('Domain name (for domain type)'),
});

// --- Defensive mappers ---

export const mapUser = (u: RawUser) => ({
  display_name: u.displayName ?? '',
  email: u.emailAddress ?? '',
  permission_id: u.permissionId ?? '',
  photo_link: u.photoLink ?? '',
});

export const mapStorageQuota = (q: NonNullable<RawAbout['storageQuota']>) => ({
  limit_bytes: q.limit ?? '0',
  usage_bytes: q.usage ?? '0',
  usage_in_drive_bytes: q.usageInDrive ?? '0',
  usage_in_trash_bytes: q.usageInDriveTrash ?? '0',
});

export const mapFile = (f: RawFile) => ({
  id: f.id ?? '',
  name: f.name ?? '',
  mime_type: f.mimeType ?? '',
  modified_time: f.modifiedTime ?? '',
  created_time: f.createdTime ?? '',
  size: f.size ?? '',
  parent_id: f.parents?.[0] ?? '',
  trashed: f.trashed ?? false,
  starred: f.starred ?? false,
  shared: f.shared ?? false,
  web_view_link: f.webViewLink ?? '',
  description: f.description ?? '',
  owner: f.owners?.[0]?.displayName ?? '',
  owner_email: f.owners?.[0]?.emailAddress ?? '',
  last_modified_by: f.lastModifyingUser?.displayName ?? '',
});

export const mapPermission = (p: RawPermission) => ({
  id: p.id ?? '',
  type: p.type ?? '',
  role: p.role ?? '',
  email: p.emailAddress ?? '',
  display_name: p.displayName ?? '',
  domain: p.domain ?? '',
});
