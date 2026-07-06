import { z } from 'zod';

// --- Repository ---

export const repositorySchema = z.object({
  name: z.string().describe('Repository name'),
  namespace: z.string().describe('Namespace (user or organization)'),
  description: z.string().describe('Short description'),
  is_private: z.boolean().describe('Whether the repository is private'),
  star_count: z.number().describe('Number of stars'),
  pull_count: z.number().describe('Number of pulls'),
  last_updated: z.string().describe('Last updated ISO 8601 timestamp'),
  repository_type: z.string().describe('Repository type (image, model, etc.)'),
  status_description: z.string().describe('Status description (active, initialized, etc.)'),
  content_types: z.array(z.string()).describe('Content types (image, unrecognized, etc.)'),
});

export interface RawRepository {
  name?: string;
  namespace?: string;
  user?: string;
  description?: string;
  is_private?: boolean;
  star_count?: number;
  pull_count?: number;
  last_updated?: string;
  repository_type?: string;
  status_description?: string;
  content_types?: string[];
}

export const mapRepository = (r: RawRepository) => ({
  name: r.name ?? '',
  namespace: r.namespace ?? r.user ?? '',
  description: r.description ?? '',
  is_private: r.is_private ?? false,
  star_count: r.star_count ?? 0,
  pull_count: r.pull_count ?? 0,
  last_updated: r.last_updated ?? '',
  repository_type: r.repository_type ?? 'image',
  status_description: r.status_description ?? '',
  content_types: r.content_types ?? [],
});

// --- Repository Detail (extends repositorySchema) ---

export const repositoryDetailSchema = repositorySchema.extend({
  full_description: z.string().describe('Full description in Markdown'),
  date_registered: z.string().describe('Date the repository was registered'),
  hub_user: z.string().describe('User who owns the repository'),
  is_automated: z.boolean().describe('Whether builds are automated'),
  categories: z.array(z.string()).describe('Category slugs'),
  permissions: z
    .object({
      admin: z.boolean().describe('Whether the user has admin permissions'),
      read: z.boolean().describe('Whether the user has read permissions'),
      write: z.boolean().describe('Whether the user has write permissions'),
    })
    .describe('User permissions on the repository'),
});

export interface RawRepositoryDetail extends RawRepository {
  full_description?: string;
  date_registered?: string;
  hub_user?: string;
  is_automated?: boolean;
  categories?: { name?: string; slug?: string }[];
  permissions?: { admin?: boolean; read?: boolean; write?: boolean };
}

export const mapRepositoryDetail = (r: RawRepositoryDetail) => ({
  ...mapRepository(r),
  full_description: r.full_description ?? '',
  date_registered: r.date_registered ?? '',
  hub_user: r.hub_user ?? '',
  is_automated: r.is_automated ?? false,
  categories: (r.categories ?? []).map(c => c.slug ?? c.name ?? ''),
  permissions: {
    admin: r.permissions?.admin ?? false,
    read: r.permissions?.read ?? false,
    write: r.permissions?.write ?? false,
  },
});

// --- Tag ---

export const tagSchema = z.object({
  name: z.string().describe('Tag name (e.g., "latest", "alpine")'),
  digest: z.string().describe('Image digest (sha256:...)'),
  full_size: z.number().describe('Compressed size in bytes'),
  last_updated: z.string().describe('Last updated ISO 8601 timestamp'),
  tag_status: z.string().describe('Tag status (active, stale)'),
  content_type: z.string().describe('Content type (image, etc.)'),
  media_type: z.string().describe('Media type'),
  images: z
    .array(
      z.object({
        architecture: z.string().describe('CPU architecture (amd64, arm64, etc.)'),
        os: z.string().describe('Operating system'),
        size: z.number().describe('Image size in bytes'),
        status: z.string().describe('Image status'),
      }),
    )
    .describe('Platform-specific images'),
});

export interface RawImage {
  architecture?: string;
  os?: string;
  size?: number;
  status?: string;
}

export interface RawTag {
  name?: string;
  digest?: string;
  full_size?: number;
  last_updated?: string;
  tag_status?: string;
  content_type?: string;
  media_type?: string;
  images?: RawImage[];
}

const mapImage = (i: RawImage) => ({
  architecture: i.architecture ?? 'unknown',
  os: i.os ?? 'unknown',
  size: i.size ?? 0,
  status: i.status ?? '',
});

export const mapTag = (t: RawTag) => ({
  name: t.name ?? '',
  digest: t.digest ?? '',
  full_size: t.full_size ?? 0,
  last_updated: t.last_updated ?? '',
  tag_status: t.tag_status ?? '',
  content_type: t.content_type ?? '',
  media_type: t.media_type ?? '',
  images: (t.images ?? []).filter(i => i.architecture !== 'unknown').map(mapImage),
});

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  username: z.string().describe('Username'),
  full_name: z.string().describe('Full name'),
  location: z.string().describe('Location'),
  company: z.string().describe('Company'),
  date_joined: z.string().describe('Date joined ISO 8601 timestamp'),
  type: z.string().describe('Account type (User, Organization)'),
  gravatar_url: z.string().describe('Gravatar URL'),
});

export interface RawUser {
  id?: string;
  uuid?: string;
  username?: string;
  full_name?: string;
  location?: string;
  company?: string;
  date_joined?: string;
  type?: string;
  gravatar_url?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? u.uuid ?? '',
  username: u.username ?? '',
  full_name: u.full_name ?? '',
  location: u.location ?? '',
  company: u.company ?? '',
  date_joined: u.date_joined ?? '',
  type: u.type ?? '',
  gravatar_url: u.gravatar_url ?? '',
});

// --- Organization ---

export const organizationSchema = z.object({
  id: z.string().describe('Organization ID'),
  orgname: z.string().describe('Organization name'),
  full_name: z.string().describe('Full display name'),
  location: z.string().describe('Location'),
  company: z.string().describe('Company name'),
  date_joined: z.string().describe('Date joined ISO 8601 timestamp'),
});

export interface RawOrganization {
  id?: string;
  orgname?: string;
  full_name?: string;
  location?: string;
  company?: string;
  date_joined?: string;
}

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? '',
  orgname: o.orgname ?? '',
  full_name: o.full_name ?? '',
  location: o.location ?? '',
  company: o.company ?? '',
  date_joined: o.date_joined ?? '',
});

// --- Search Result ---

export const searchResultSchema = z.object({
  repo_name: z.string().describe('Repository name in namespace/repo format'),
  short_description: z.string().describe('Short description'),
  star_count: z.number().describe('Number of stars'),
  pull_count: z.number().describe('Number of pulls'),
  is_official: z.boolean().describe('Whether this is a Docker Official Image'),
  is_automated: z.boolean().describe('Whether builds are automated'),
});

export interface RawSearchResult {
  repo_name?: string;
  short_description?: string;
  star_count?: number;
  pull_count?: number;
  is_official?: boolean;
  is_automated?: boolean;
}

export const mapSearchResult = (r: RawSearchResult) => ({
  repo_name: r.repo_name ?? '',
  short_description: r.short_description ?? '',
  star_count: r.star_count ?? 0,
  pull_count: r.pull_count ?? 0,
  is_official: r.is_official ?? false,
  is_automated: r.is_automated ?? false,
});

// --- Catalog Search Result (v3 API) ---

export const catalogResultSchema = z.object({
  name: z.string().describe('Display name'),
  slug: z.string().describe('Slug identifier (namespace/name)'),
  type: z.string().describe('Content type (image, model, extension)'),
  source: z.string().describe('Source (official, verified_publisher, community)'),
  short_description: z.string().describe('Short description'),
  star_count: z.number().describe('Number of stars'),
  categories: z.array(z.string()).describe('Category names'),
  updated_at: z.string().describe('Last updated ISO 8601 timestamp'),
});

export interface RawCatalogResult {
  name?: string;
  slug?: string;
  type?: string;
  source?: string;
  short_description?: string;
  star_count?: number;
  categories?: { name?: string }[];
  updated_at?: string;
}

export const mapCatalogResult = (r: RawCatalogResult) => ({
  name: r.name ?? '',
  slug: r.slug ?? '',
  type: r.type ?? '',
  source: r.source ?? '',
  short_description: r.short_description ?? '',
  star_count: r.star_count ?? 0,
  categories: (r.categories ?? []).map(c => c.name ?? ''),
  updated_at: r.updated_at ?? '',
});

// --- Paginated response helpers ---

export interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
}
