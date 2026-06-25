import { z } from 'zod';

// --- Maintainer ---

export const maintainerSchema = z.object({
  name: z.string().describe('npm username'),
});

interface RawMaintainer {
  name?: string;
  email?: string;
}

export const mapMaintainer = (m: RawMaintainer) => ({
  name: m.name ?? '',
});

// --- Search result package ---

export const searchPackageSchema = z.object({
  name: z.string().describe('Package name'),
  version: z.string().describe('Latest version'),
  description: z.string().describe('Package description'),
  keywords: z.array(z.string()).describe('Package keywords'),
  date: z.string().describe('Last publish date (ISO 8601)'),
  publisher: z.string().describe('Publisher username'),
  maintainers: z.array(z.string()).describe('Maintainer usernames'),
  npm_url: z.string().describe('npmjs.com URL'),
  homepage: z.string().describe('Homepage URL'),
  repository: z.string().describe('Repository URL'),
  bugs: z.string().describe('Bug tracker URL'),
  score_final: z.number().describe('Overall quality score (0-1)'),
  score_quality: z.number().describe('Quality score (0-1)'),
  score_popularity: z.number().describe('Popularity score (0-1)'),
  score_maintenance: z.number().describe('Maintenance score (0-1)'),
  search_score: z.number().describe('Search relevance score'),
});

export interface RawSearchObject {
  // Spiferack search returns a flatter shape than the public registry API
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  date?: { rel?: string; ts?: number } | string;
  publisher?: { name?: string; username?: string };
  maintainers?: string[] | Array<{ username?: string; name?: string }>;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  bugs?: { url?: string } | string;
  homepage?: string;
  repository?: { url?: string } | string;
  // Public registry search wraps in a `package` object with score
  package?: {
    name?: string;
    version?: string;
    description?: string;
    keywords?: string[];
    date?: string;
    publisher?: { username?: string };
    maintainers?: Array<{ username?: string }>;
    links?: {
      npm?: string;
      homepage?: string;
      repository?: string;
      bugs?: string;
    };
  };
  score?: {
    final?: number;
    detail?: { quality?: number; popularity?: number; maintenance?: number };
  };
  searchScore?: number;
}

const extractDate = (d: RawSearchObject['date']): string => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return d.rel ?? '';
};

const extractMaintainers = (m: RawSearchObject['maintainers']): string[] => {
  if (!m) return [];
  return m.map(item => (typeof item === 'string' ? item : (item.username ?? item.name ?? '')));
};

const extractUrl = (v: { url?: string } | string | undefined): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.url ?? '';
};

export const mapSearchPackage = (o: RawSearchObject) => {
  // Handle both spiferack (flat) and registry API (nested) shapes
  const pkg = o.package;
  const name = o.name ?? pkg?.name ?? '';
  const maintainers = extractMaintainers(o.maintainers);
  return {
    name,
    version: o.version ?? pkg?.version ?? '',
    description: o.description ?? pkg?.description ?? '',
    keywords: o.keywords ?? pkg?.keywords ?? [],
    date: extractDate(o.date) || (pkg?.date ?? ''),
    publisher: o.publisher?.name ?? o.publisher?.username ?? pkg?.publisher?.username ?? '',
    maintainers: maintainers.length > 0 ? maintainers : (pkg?.maintainers ?? []).map(m => m.username ?? ''),
    npm_url: o.links?.npm ?? pkg?.links?.npm ?? (name ? `https://www.npmjs.com/package/${name}` : ''),
    homepage: o.homepage ?? o.links?.homepage ?? pkg?.links?.homepage ?? '',
    repository: extractUrl(o.repository) || (o.links?.repository ?? pkg?.links?.repository ?? ''),
    bugs: extractUrl(o.bugs) || (o.links?.bugs ?? pkg?.links?.bugs ?? ''),
    score_final: o.score?.final ?? 0,
    score_quality: o.score?.detail?.quality ?? 0,
    score_popularity: o.score?.detail?.popularity ?? 0,
    score_maintenance: o.score?.detail?.maintenance ?? 0,
    search_score: o.searchScore ?? 0,
  };
};

// --- Package detail ---

export const packageSchema = z.object({
  name: z.string().describe('Package name'),
  version: z.string().describe('Latest version'),
  description: z.string().describe('Package description'),
  license: z.string().describe('License identifier (e.g., "MIT")'),
  homepage: z.string().describe('Homepage URL'),
  repository_url: z.string().describe('Repository URL'),
  bugs_url: z.string().describe('Bug tracker URL'),
  keywords: z.array(z.string()).describe('Package keywords'),
  author_name: z.string().describe('Author name'),
  maintainers: z.array(maintainerSchema).describe('Package maintainers'),
  dist_tags: z.record(z.string(), z.string()).describe('Dist-tags mapping (e.g., latest, next)'),
  last_publish_time: z.string().describe('Last publish timestamp (ISO 8601)'),
  last_publish_maintainer: z.string().describe('Last publish maintainer'),
  typescript_support: z.string().describe('TypeScript support type'),
  is_starred: z.boolean().describe('Whether the current user has starred'),
  dependents_count: z.string().describe('Number of dependent packages'),
  funding_url: z.string().describe('Funding/sponsor URL'),
  has_provenance: z.boolean().describe('Whether provenance is enabled'),
});

export interface RawPackagePage {
  packageVersion?: {
    name?: string;
    version?: string;
    description?: string;
    license?: string;
    homepage?: string;
    repository?: { url?: string } | string;
    keywords?: string[];
    author?: { name?: string };
    maintainers?: Array<{ name?: string }>;
    funding?: { url?: string };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    versions?: string[];
    deprecations?: Record<string, string>;
  };
  capsule?: {
    name?: string;
    description?: string;
    maintainers?: string[];
    'dist-tags'?: Record<string, string>;
    lastPublish?: { maintainer?: string; time?: string };
    types?: { typescript?: { package?: string; bundled?: string } };
  };
  isStarred?: boolean;
  dependents?: { dependentsCount?: string };
  provenance?: { enabled?: boolean };
  downloads?: Array<{ downloads?: number; label?: string }>;
  readme?: string;
  deps?: Record<string, unknown>;
  devDeps?: Record<string, unknown>;
  packument?: {
    name?: string;
    'dist-tags'?: Record<string, string>;
    maintainers?: Array<{ name?: string }>;
    modified?: string;
  };
}

export const mapPackage = (p: RawPackagePage) => ({
  name: p.packageVersion?.name ?? p.capsule?.name ?? '',
  version: p.packageVersion?.version ?? '',
  description: p.packageVersion?.description ?? p.capsule?.description ?? '',
  license: p.packageVersion?.license ?? '',
  homepage: p.packageVersion?.homepage ?? '',
  repository_url:
    typeof p.packageVersion?.repository === 'string'
      ? p.packageVersion.repository
      : (p.packageVersion?.repository?.url ?? ''),
  bugs_url: '',
  keywords: p.packageVersion?.keywords ?? [],
  author_name: p.packageVersion?.author?.name ?? '',
  maintainers: (p.packageVersion?.maintainers ?? []).map(mapMaintainer),
  dist_tags: p.capsule?.['dist-tags'] ?? p.packument?.['dist-tags'] ?? {},
  last_publish_time: p.capsule?.lastPublish?.time ?? '',
  last_publish_maintainer: p.capsule?.lastPublish?.maintainer ?? '',
  typescript_support: p.capsule?.types?.typescript?.bundled ? 'bundled' : (p.capsule?.types?.typescript?.package ?? ''),
  is_starred: p.isStarred ?? false,
  dependents_count: p.dependents?.dependentsCount ?? '0',
  funding_url: p.packageVersion?.funding?.url ?? '',
  has_provenance: p.provenance?.enabled ?? false,
});

// --- Download stat ---

export const downloadStatSchema = z.object({
  downloads: z.number().describe('Download count for the period'),
  label: z.string().describe('Date range label (e.g., "2025-03-11 to 2025-03-17")'),
});

export interface RawDownloadStat {
  downloads?: number;
  label?: string;
}

export const mapDownloadStat = (d: RawDownloadStat) => ({
  downloads: d.downloads ?? 0,
  label: d.label ?? '',
});

// --- Dependency ---

export const dependencySchema = z.object({
  name: z.string().describe('Package name'),
  version: z.string().describe('Version range'),
});

export const mapDependencies = (deps: Record<string, string> | undefined) =>
  Object.entries(deps ?? {}).map(([name, version]) => ({
    name,
    version: String(version),
  }));

// --- Version info ---

export const versionInfoSchema = z.object({
  version: z.string().describe('Version number'),
  deprecated: z.string().describe('Deprecation message, empty if not deprecated'),
});

// --- User profile ---

export const userProfileSchema = z.object({
  name: z.string().describe('npm username'),
  avatar_url: z.string().describe('Avatar URL (large)'),
  packages_count: z.number().describe('Number of public packages'),
  orgs: z.array(z.string()).describe('Organization names'),
});

export interface RawProfilePage {
  scope?: {
    type?: string;
    name?: string;
    parent?: { name?: string; avatars?: { large?: string } };
  };
  packages?: {
    total?: number;
    objects?: Array<{
      name?: string;
      version?: string;
      description?: string;
      date?: { rel?: string };
    }>;
  };
  orgs?: { objects?: Array<{ name?: string }> };
}

export const mapUserProfile = (p: RawProfilePage) => ({
  name: p.scope?.parent?.name ?? p.scope?.name ?? '',
  avatar_url: p.scope?.parent?.avatars?.large ?? '',
  packages_count: p.packages?.total ?? 0,
  orgs: (p.orgs?.objects ?? []).map(o => o.name ?? ''),
});

// --- User package ---

export const userPackageSchema = z.object({
  name: z.string().describe('Package name'),
  version: z.string().describe('Latest version'),
  description: z.string().describe('Package description'),
  date: z.string().describe('Relative publish date (e.g., "2 days ago")'),
});

export interface RawUserPackage {
  name?: string;
  version?: string;
  description?: string;
  date?: { rel?: string };
}

export const mapUserPackage = (p: RawUserPackage) => ({
  name: p.name ?? '',
  version: p.version ?? '',
  description: p.description ?? '',
  date: p.date?.rel ?? '',
});

// --- Organization ---

export const organizationSchema = z.object({
  name: z.string().describe('Organization name'),
  description: z.string().describe('Organization description'),
  created: z.string().describe('Creation date (ISO 8601)'),
  packages_count: z.number().describe('Number of packages'),
  tfa_enforced: z.boolean().describe('Whether 2FA is enforced'),
});

export interface RawOrgPage {
  scope?: {
    type?: string;
    parent?: {
      name?: string;
      description?: string;
      tfa_enforced?: boolean;
      created?: string;
    };
    account?: { plan?: { name?: string } };
  };
  packages?: { total?: number; objects?: unknown[] };
}

export const mapOrganization = (p: RawOrgPage) => ({
  name: p.scope?.parent?.name ?? '',
  description: p.scope?.parent?.description ?? '',
  created: p.scope?.parent?.created ?? '',
  packages_count: p.packages?.total ?? 0,
  tfa_enforced: p.scope?.parent?.tfa_enforced ?? false,
});

// --- Dependent ---

export const dependentSchema = z.object({
  name: z.string().describe('Dependent package name'),
});

// --- Token ---

export const tokenSchema = z.object({
  token: z.string().describe('Token value (masked, e.g., "npm_52ab......TJGu")'),
  readonly: z.boolean().describe('Whether the token is read-only'),
  created: z.string().describe('Creation date (ISO 8601)'),
  updated: z.string().describe('Last updated date (ISO 8601)'),
});

export interface RawToken {
  token?: string;
  readonly?: boolean;
  created?: string;
  updated?: string;
}

export const mapToken = (t: RawToken) => ({
  token: t.token ?? '',
  readonly: t.readonly ?? false,
  created: t.created ?? '',
  updated: t.updated ?? '',
});
