import { z } from 'zod';

// --- Zone (Domain) ---

export const zoneSchema = z.object({
  id: z.string().describe('Zone ID (32-char hex)'),
  name: z.string().describe('Domain name (e.g., "example.com")'),
  status: z.string().describe('Zone status: "active", "pending", "initializing", "moved"'),
  paused: z.boolean().describe('Whether Cloudflare is paused for this zone'),
  type: z.string().describe('Zone type: "full", "partial", "secondary"'),
  name_servers: z.array(z.string()).describe('Assigned Cloudflare nameservers'),
  plan_name: z.string().describe('Current plan name (e.g., "Free", "Pro", "Business", "Enterprise")'),
  created_on: z.string().describe('ISO 8601 creation timestamp'),
  modified_on: z.string().describe('ISO 8601 last modification timestamp'),
  account_id: z.string().describe('Account ID this zone belongs to'),
  account_name: z.string().describe('Account name'),
});

export type Zone = z.infer<typeof zoneSchema>;

export const mapZone = (z: Record<string, unknown>): Zone => {
  const account = z.account as Record<string, unknown> | undefined;
  const plan = z.plan as Record<string, unknown> | undefined;
  return {
    id: (z.id as string) ?? '',
    name: (z.name as string) ?? '',
    status: (z.status as string) ?? '',
    paused: (z.paused as boolean) ?? false,
    type: (z.type as string) ?? '',
    name_servers: Array.isArray(z.name_servers) ? (z.name_servers as string[]) : [],
    plan_name: (plan?.name as string) ?? '',
    created_on: (z.created_on as string) ?? '',
    modified_on: (z.modified_on as string) ?? '',
    account_id: (account?.id as string) ?? '',
    account_name: (account?.name as string) ?? '',
  };
};

// --- DNS Record ---

export const dnsRecordSchema = z.object({
  id: z.string().describe('DNS record ID'),
  type: z.string().describe('Record type (A, AAAA, CNAME, MX, TXT, NS, SRV, etc.)'),
  name: z.string().describe('DNS record name (e.g., "example.com", "www.example.com")'),
  content: z.string().describe('Record content (e.g., IP address, CNAME target, TXT value)'),
  proxied: z.boolean().describe('Whether traffic is proxied through Cloudflare (orange cloud)'),
  ttl: z.number().describe('TTL in seconds (1 = automatic)'),
  priority: z.number().nullable().describe('Priority (for MX and SRV records)'),
  comment: z.string().nullable().describe('User-supplied comment'),
  created_on: z.string().describe('ISO 8601 creation timestamp'),
  modified_on: z.string().describe('ISO 8601 last modification timestamp'),
});

export type DnsRecord = z.infer<typeof dnsRecordSchema>;

export const mapDnsRecord = (r: Record<string, unknown>): DnsRecord => ({
  id: (r.id as string) ?? '',
  type: (r.type as string) ?? '',
  name: (r.name as string) ?? '',
  content: (r.content as string) ?? '',
  proxied: (r.proxied as boolean) ?? false,
  ttl: (r.ttl as number) ?? 1,
  priority: (r.priority as number) ?? null,
  comment: (r.comment as string) ?? null,
  created_on: (r.created_on as string) ?? '',
  modified_on: (r.modified_on as string) ?? '',
});

// --- Worker ---

export const workerSchema = z.object({
  id: z.string().describe('Worker script name'),
  created_on: z.string().describe('ISO 8601 creation timestamp'),
  modified_on: z.string().describe('ISO 8601 last modification timestamp'),
  etag: z.string().describe('ETag for the worker script'),
  usage_model: z.string().describe('Usage model: "bundled" or "unbound"'),
  compatibility_date: z.string().nullable().describe('Workers compatibility date'),
});

export type Worker = z.infer<typeof workerSchema>;

export const mapWorker = (w: Record<string, unknown>): Worker => ({
  id: (w.id as string) ?? '',
  created_on: (w.created_on as string) ?? '',
  modified_on: (w.modified_on as string) ?? '',
  etag: (w.etag as string) ?? '',
  usage_model: (w.usage_model as string) ?? '',
  compatibility_date: (w.compatibility_date as string) ?? null,
});

// --- Pages Project ---

export const pagesProjectSchema = z.object({
  id: z.string().describe('Pages project ID'),
  name: z.string().describe('Project name'),
  subdomain: z.string().describe('Pages subdomain (e.g., "project.pages.dev")'),
  production_branch: z.string().describe('Production branch name'),
  created_on: z.string().describe('ISO 8601 creation timestamp'),
  source_type: z.string().nullable().describe('Source type (e.g., "github")'),
  source_repo: z.string().nullable().describe('Source repository (e.g., "owner/repo")'),
});

export type PagesProject = z.infer<typeof pagesProjectSchema>;

export const mapPagesProject = (p: Record<string, unknown>): PagesProject => {
  const source = p.source as Record<string, unknown> | undefined;
  const config = source?.config as Record<string, unknown> | undefined;
  return {
    id: (p.id as string) ?? '',
    name: (p.name as string) ?? '',
    subdomain: (p.subdomain as string) ?? '',
    production_branch: (p.production_branch as string) ?? 'main',
    created_on: (p.created_on as string) ?? '',
    source_type: (source?.type as string) ?? null,
    source_repo: config ? `${(config.owner as string) ?? ''}/${(config.repo_name as string) ?? ''}` : null,
  };
};

// --- Pagination ---

export const paginationSchema = z.object({
  page: z.number().describe('Current page number'),
  per_page: z.number().describe('Results per page'),
  count: z.number().describe('Number of results on this page'),
  total_count: z.number().describe('Total number of results'),
  total_pages: z.number().describe('Total number of pages'),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const mapPagination = (info: Record<string, unknown> | undefined): Pagination => ({
  page: (info?.page as number) ?? 1,
  per_page: (info?.per_page as number) ?? 20,
  count: (info?.count as number) ?? 0,
  total_count: (info?.total_count as number) ?? 0,
  total_pages: (info?.total_pages as number) ?? 0,
});
