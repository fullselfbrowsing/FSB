import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared output schemas & defensive mappers for Netlify API entities
// ---------------------------------------------------------------------------

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  full_name: z.string().describe('Full display name'),
  email: z.string().describe('Primary email address'),
  avatar_url: z.string().describe('Avatar image URL or empty'),
  site_count: z.number().describe('Number of sites owned by the user'),
  created_at: z.string().describe('Account creation ISO 8601 timestamp'),
  last_login: z.string().describe('Last login ISO 8601 timestamp'),
  login_providers: z.array(z.string()).describe('Authentication providers (e.g. github, email)'),
  mfa_enabled: z.boolean().describe('Whether multi-factor authentication is enabled'),
});

export interface RawUser {
  id?: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  site_count?: number;
  created_at?: string;
  last_login?: string;
  login_providers?: string[];
  mfa_enabled?: boolean;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  full_name: u.full_name ?? '',
  email: u.email ?? '',
  avatar_url: u.avatar_url ?? '',
  site_count: u.site_count ?? 0,
  created_at: u.created_at ?? '',
  last_login: u.last_login ?? '',
  login_providers: u.login_providers ?? [],
  mfa_enabled: u.mfa_enabled ?? false,
});

// --- Account ---

export const accountSchema = z.object({
  id: z.string().describe('Account ID'),
  name: z.string().describe('Account display name'),
  slug: z.string().describe('URL-safe account slug'),
  type: z.string().describe('Account type identifier'),
  type_name: z.string().describe('Human-readable account type name'),
  capabilities_sites_included: z.number().describe('Number of sites included in the plan'),
  capabilities_sites_used: z.number().describe('Number of sites currently used'),
  capabilities_collaborators_included: z.number().describe('Number of collaborators included in the plan'),
  capabilities_collaborators_used: z.number().describe('Number of collaborators currently used'),
  billing_name: z.string().describe('Billing contact name'),
  billing_email: z.string().describe('Billing contact email'),
  owner_ids: z.array(z.string()).describe('User IDs of account owners'),
  created_at: z.string().describe('Account creation ISO 8601 timestamp'),
  updated_at: z.string().describe('Last update ISO 8601 timestamp'),
});

export interface RawAccount {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  type_name?: string;
  capabilities?: {
    sites?: { included?: number; used?: number };
    collaborators?: { included?: number; used?: number };
  };
  billing_name?: string;
  billing_email?: string;
  owner_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export const mapAccount = (a: RawAccount) => ({
  id: a.id ?? '',
  name: a.name ?? '',
  slug: a.slug ?? '',
  type: a.type ?? '',
  type_name: a.type_name ?? '',
  capabilities_sites_included: a.capabilities?.sites?.included ?? 0,
  capabilities_sites_used: a.capabilities?.sites?.used ?? 0,
  capabilities_collaborators_included: a.capabilities?.collaborators?.included ?? 0,
  capabilities_collaborators_used: a.capabilities?.collaborators?.used ?? 0,
  billing_name: a.billing_name ?? '',
  billing_email: a.billing_email ?? '',
  owner_ids: a.owner_ids ?? [],
  created_at: a.created_at ?? '',
  updated_at: a.updated_at ?? '',
});

// --- Member ---

export const memberSchema = z.object({
  id: z.string().describe('Member user ID'),
  full_name: z.string().describe('Full display name'),
  email: z.string().describe('Email address'),
  avatar: z.string().describe('Avatar image URL or empty'),
  role: z.string().describe('Team role (e.g. Owner, Collaborator)'),
  pending: z.boolean().describe('Whether the membership invitation is pending'),
  mfa_enabled: z.boolean().describe('Whether multi-factor authentication is enabled'),
});

export interface RawMember {
  id?: string;
  full_name?: string;
  email?: string;
  avatar?: string;
  role?: string;
  pending?: boolean;
  mfa_enabled?: boolean;
}

export const mapMember = (m: RawMember) => ({
  id: m.id ?? '',
  full_name: m.full_name ?? '',
  email: m.email ?? '',
  avatar: m.avatar ?? '',
  role: m.role ?? '',
  pending: m.pending ?? false,
  mfa_enabled: m.mfa_enabled ?? false,
});

// --- Site ---

export const siteSchema = z.object({
  id: z.string().describe('Site ID'),
  name: z.string().describe('Site name (subdomain prefix)'),
  state: z.string().describe('Site state (e.g. current)'),
  url: z.string().describe('Primary site URL'),
  ssl_url: z.string().describe('HTTPS site URL'),
  admin_url: z.string().describe('Netlify dashboard admin URL'),
  deploy_url: z.string().describe('Latest deploy preview URL'),
  screenshot_url: z.string().describe('Site screenshot URL or empty'),
  custom_domain: z.string().describe('Custom domain name or empty'),
  domain_aliases: z.array(z.string()).describe('Additional domain aliases'),
  created_at: z.string().describe('Site creation ISO 8601 timestamp'),
  updated_at: z.string().describe('Last update ISO 8601 timestamp'),
  account_name: z.string().describe('Owning account display name'),
  account_slug: z.string().describe('Owning account slug'),
  git_provider: z.string().describe('Git hosting provider (e.g. github) or empty'),
  ssl: z.boolean().describe('Whether SSL is provisioned'),
  force_ssl: z.boolean().describe('Whether HTTPS is enforced'),
  managed_dns: z.boolean().describe('Whether DNS is managed by Netlify'),
  build_image: z.string().describe('Build image identifier or empty'),
  framework: z.string().describe('Detected framework from published deploy or empty'),
  repo_url: z.string().describe('Connected Git repository URL or empty'),
  repo_branch: z.string().describe('Production branch name or empty'),
  build_cmd: z.string().describe('Build command or empty'),
});

export interface RawSite {
  id?: string;
  name?: string;
  state?: string;
  url?: string;
  ssl_url?: string;
  admin_url?: string;
  deploy_url?: string;
  screenshot_url?: string;
  custom_domain?: string | null;
  domain_aliases?: string[];
  created_at?: string;
  updated_at?: string;
  account_name?: string;
  account_slug?: string;
  git_provider?: string;
  ssl?: boolean;
  force_ssl?: boolean;
  managed_dns?: boolean;
  build_image?: string;
  published_deploy?: { framework?: string | null };
  build_settings?: {
    repo_url?: string;
    repo_branch?: string;
    cmd?: string;
  };
}

export const mapSite = (s: RawSite) => ({
  id: s.id ?? '',
  name: s.name ?? '',
  state: s.state ?? '',
  url: s.url ?? '',
  ssl_url: s.ssl_url ?? '',
  admin_url: s.admin_url ?? '',
  deploy_url: s.deploy_url ?? '',
  screenshot_url: s.screenshot_url ?? '',
  custom_domain: s.custom_domain ?? '',
  domain_aliases: s.domain_aliases ?? [],
  created_at: s.created_at ?? '',
  updated_at: s.updated_at ?? '',
  account_name: s.account_name ?? '',
  account_slug: s.account_slug ?? '',
  git_provider: s.git_provider ?? '',
  ssl: s.ssl ?? false,
  force_ssl: s.force_ssl ?? false,
  managed_dns: s.managed_dns ?? false,
  build_image: s.build_image ?? '',
  framework: s.published_deploy?.framework ?? '',
  repo_url: s.build_settings?.repo_url ?? '',
  repo_branch: s.build_settings?.repo_branch ?? '',
  build_cmd: s.build_settings?.cmd ?? '',
});

// --- Deploy ---

export const deploySchema = z.object({
  id: z.string().describe('Deploy ID'),
  site_id: z.string().describe('Parent site ID'),
  state: z.string().describe('Deploy state (e.g. ready, building, error, enqueued)'),
  name: z.string().describe('Site name at the time of deploy'),
  url: z.string().describe('Deploy URL'),
  ssl_url: z.string().describe('Deploy HTTPS URL'),
  deploy_url: z.string().describe('Unique deploy preview URL'),
  deploy_ssl_url: z.string().describe('Unique deploy preview HTTPS URL'),
  branch: z.string().describe('Git branch name or empty'),
  commit_ref: z.string().describe('Git commit SHA or empty'),
  commit_url: z.string().describe('Link to the commit or empty'),
  title: z.string().describe('Deploy title or commit message'),
  context: z.string().describe('Deploy context (e.g. production, deploy-preview, branch-deploy)'),
  framework: z.string().describe('Detected framework or empty'),
  error_message: z.string().describe('Error message if deploy failed or empty'),
  created_at: z.string().describe('Deploy creation ISO 8601 timestamp'),
  updated_at: z.string().describe('Last update ISO 8601 timestamp'),
  published_at: z.string().describe('Publish ISO 8601 timestamp or empty'),
  locked: z.boolean().describe('Whether the deploy is locked (auto-publishing disabled)'),
  draft: z.boolean().describe('Whether this is a draft deploy'),
  skipped: z.boolean().describe('Whether the deploy was skipped'),
});

export interface RawDeploy {
  id?: string;
  site_id?: string;
  state?: string;
  name?: string;
  url?: string;
  ssl_url?: string;
  deploy_url?: string;
  deploy_ssl_url?: string;
  branch?: string | null;
  commit_ref?: string | null;
  commit_url?: string | null;
  title?: string | null;
  context?: string;
  framework?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  locked?: boolean | null;
  draft?: boolean;
  skipped?: boolean;
}

export const mapDeploy = (d: RawDeploy) => ({
  id: d.id ?? '',
  site_id: d.site_id ?? '',
  state: d.state ?? '',
  name: d.name ?? '',
  url: d.url ?? '',
  ssl_url: d.ssl_url ?? '',
  deploy_url: d.deploy_url ?? '',
  deploy_ssl_url: d.deploy_ssl_url ?? '',
  branch: d.branch ?? '',
  commit_ref: d.commit_ref ?? '',
  commit_url: d.commit_url ?? '',
  title: d.title ?? '',
  context: d.context ?? '',
  framework: d.framework ?? '',
  error_message: d.error_message ?? '',
  created_at: d.created_at ?? '',
  updated_at: d.updated_at ?? '',
  published_at: d.published_at ?? '',
  locked: d.locked ?? false,
  draft: d.draft ?? false,
  skipped: d.skipped ?? false,
});

// --- Build ---

export const buildSchema = z.object({
  id: z.string().describe('Build ID'),
  deploy_id: z.string().describe('Associated deploy ID'),
  sha: z.string().describe('Git commit SHA or empty'),
  done: z.boolean().describe('Whether the build has finished'),
  error: z.string().describe('Build error message or empty'),
  created_at: z.string().describe('Build creation ISO 8601 timestamp'),
});

export interface RawBuild {
  id?: string;
  deploy_id?: string;
  sha?: string | null;
  done?: boolean;
  error?: string | null;
  created_at?: string;
}

export const mapBuild = (b: RawBuild) => ({
  id: b.id ?? '',
  deploy_id: b.deploy_id ?? '',
  sha: b.sha ?? '',
  done: b.done ?? false,
  error: b.error ?? '',
  created_at: b.created_at ?? '',
});

// --- EnvVar ---

export const envVarValueSchema = z.object({
  id: z.string().describe('Environment variable value ID'),
  value: z.string().describe('Variable value (masked if secret)'),
  context: z.string().describe('Deploy context (e.g. all, production, deploy-preview, branch-deploy, dev)'),
  context_parameter: z.string().describe('Branch name when context is branch-specific or empty'),
});

export const envVarSchema = z.object({
  key: z.string().describe('Environment variable name'),
  scopes: z.array(z.string()).describe('Scopes where the variable is available (e.g. builds, functions, runtime)'),
  values: z.array(envVarValueSchema).describe('Context-specific values for this variable'),
  is_secret: z.boolean().describe('Whether the variable value is secret and masked'),
  updated_at: z.string().describe('Last update ISO 8601 timestamp'),
});

export interface RawEnvVarValue {
  id?: string;
  value?: string;
  context?: string;
  context_parameter?: string;
}

export interface RawEnvVar {
  key?: string;
  scopes?: string[];
  values?: RawEnvVarValue[];
  is_secret?: boolean;
  updated_at?: string;
}

export const mapEnvVarValue = (v: RawEnvVarValue) => ({
  id: v.id ?? '',
  value: v.value ?? '',
  context: v.context ?? '',
  context_parameter: v.context_parameter ?? '',
});

export const mapEnvVar = (e: RawEnvVar) => ({
  key: e.key ?? '',
  scopes: e.scopes ?? [],
  values: (e.values ?? []).map(mapEnvVarValue),
  is_secret: e.is_secret ?? false,
  updated_at: e.updated_at ?? '',
});

// --- DnsZone ---

export const dnsZoneSchema = z.object({
  id: z.string().describe('DNS zone ID'),
  name: z.string().describe('Domain name for the zone'),
  account_slug: z.string().describe('Owning account slug'),
  site_id: z.string().describe('Associated site ID or empty'),
  created_at: z.string().describe('Zone creation ISO 8601 timestamp'),
  updated_at: z.string().describe('Last update ISO 8601 timestamp'),
  records_count: z.number().describe('Number of DNS records in the zone'),
  dedicated: z.boolean().describe('Whether the zone uses dedicated DNS infrastructure'),
});

export interface RawDnsZone {
  id?: string;
  name?: string;
  account_slug?: string;
  site_id?: string | null;
  created_at?: string;
  updated_at?: string;
  records_count?: number;
  dedicated?: boolean;
}

export const mapDnsZone = (d: RawDnsZone) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  account_slug: d.account_slug ?? '',
  site_id: d.site_id ?? '',
  created_at: d.created_at ?? '',
  updated_at: d.updated_at ?? '',
  records_count: d.records_count ?? 0,
  dedicated: d.dedicated ?? false,
});

// --- DnsRecord ---

export const dnsRecordSchema = z.object({
  id: z.string().describe('DNS record ID'),
  hostname: z.string().describe('Fully qualified hostname'),
  type: z.string().describe('Record type (e.g. A, AAAA, CNAME, MX, TXT, NS)'),
  value: z.string().describe('Record value (IP address, hostname, or text)'),
  ttl: z.number().describe('Time to live in seconds'),
  priority: z.number().describe('Record priority (used by MX and SRV records, 0 otherwise)'),
  dns_zone_id: z.string().describe('Parent DNS zone ID'),
  flag: z.number().describe('CAA record flag (0 otherwise)'),
  tag: z.string().describe('CAA record tag or empty'),
});

export interface RawDnsRecord {
  id?: string;
  hostname?: string;
  type?: string;
  value?: string;
  ttl?: number;
  priority?: number;
  dns_zone_id?: string;
  flag?: number;
  tag?: string;
}

export const mapDnsRecord = (r: RawDnsRecord) => ({
  id: r.id ?? '',
  hostname: r.hostname ?? '',
  type: r.type ?? '',
  value: r.value ?? '',
  ttl: r.ttl ?? 0,
  priority: r.priority ?? 0,
  dns_zone_id: r.dns_zone_id ?? '',
  flag: r.flag ?? 0,
  tag: r.tag ?? '',
});

// --- Hook (notification/outgoing webhook) ---

export const hookSchema = z.object({
  id: z.string().describe('Hook ID'),
  site_id: z.string().describe('Associated site ID'),
  type: z.string().describe('Hook type (e.g. url, email, slack)'),
  event: z.string().describe('Trigger event name (e.g. deploy_building, deploy_created, deploy_failed)'),
  data: z.record(z.string(), z.unknown()).describe('Hook configuration data'),
  created_at: z.string().describe('Hook creation ISO 8601 timestamp'),
  updated_at: z.string().describe('Last update ISO 8601 timestamp'),
  disabled: z.boolean().describe('Whether the hook is disabled'),
});

export interface RawHook {
  id?: string;
  site_id?: string;
  type?: string;
  event?: string;
  data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  disabled?: boolean;
}

export const mapHook = (h: RawHook) => ({
  id: h.id ?? '',
  site_id: h.site_id ?? '',
  type: h.type ?? '',
  event: h.event ?? '',
  data: h.data ?? {},
  created_at: h.created_at ?? '',
  updated_at: h.updated_at ?? '',
  disabled: h.disabled ?? false,
});

// --- BuildHook ---

export const buildHookSchema = z.object({
  id: z.string().describe('Build hook ID'),
  title: z.string().describe('Build hook display title'),
  branch: z.string().describe('Git branch triggered by this hook'),
  url: z.string().describe('Build hook trigger URL'),
  site_id: z.string().describe('Associated site ID'),
  created_at: z.string().describe('Build hook creation ISO 8601 timestamp'),
});

export interface RawBuildHook {
  id?: string;
  title?: string;
  branch?: string;
  url?: string;
  site_id?: string;
  created_at?: string;
}

export const mapBuildHook = (h: RawBuildHook) => ({
  id: h.id ?? '',
  title: h.title ?? '',
  branch: h.branch ?? '',
  url: h.url ?? '',
  site_id: h.site_id ?? '',
  created_at: h.created_at ?? '',
});

// --- Form ---

export const formSchema = z.object({
  id: z.string().describe('Form ID'),
  site_id: z.string().describe('Parent site ID'),
  name: z.string().describe('Form name'),
  paths: z.array(z.string()).describe('Page paths where the form appears'),
  submission_count: z.number().describe('Total number of submissions received'),
  fields: z.array(z.string()).describe('Form field names'),
  created_at: z.string().describe('Form creation ISO 8601 timestamp'),
});

export interface RawForm {
  id?: string;
  site_id?: string;
  name?: string;
  paths?: string[];
  submission_count?: number;
  fields?: string[];
  created_at?: string;
}

export const mapForm = (f: RawForm) => ({
  id: f.id ?? '',
  site_id: f.site_id ?? '',
  name: f.name ?? '',
  paths: f.paths ?? [],
  submission_count: f.submission_count ?? 0,
  fields: f.fields ?? [],
  created_at: f.created_at ?? '',
});

// --- FormSubmission ---

export const formSubmissionSchema = z.object({
  id: z.string().describe('Submission ID'),
  form_id: z.string().describe('Parent form ID'),
  form_name: z.string().describe('Parent form name'),
  name: z.string().describe('Submitter name field value or empty'),
  email: z.string().describe('Submitter email field value or empty'),
  body: z.string().describe('Submission body text or empty'),
  data: z.record(z.string(), z.unknown()).describe('Full submission data as key-value pairs'),
  created_at: z.string().describe('Submission ISO 8601 timestamp'),
});

export interface RawFormSubmission {
  id?: string;
  form_id?: string;
  form_name?: string;
  name?: string | null;
  email?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  created_at?: string;
}

export const mapFormSubmission = (s: RawFormSubmission) => ({
  id: s.id ?? '',
  form_id: s.form_id ?? '',
  form_name: s.form_name ?? '',
  name: s.name ?? '',
  email: s.email ?? '',
  body: s.body ?? '',
  data: s.data ?? {},
  created_at: s.created_at ?? '',
});

// --- AuditEvent ---

export const auditEventSchema = z.object({
  id: z.string().describe('Audit event ID'),
  account_id: z.string().describe('Account where the event occurred'),
  actor_id: z.string().describe('User ID of the actor'),
  actor_name: z.string().describe('Display name of the actor'),
  actor_email: z.string().describe('Email address of the actor'),
  action: z.string().describe('Action performed (e.g. site:create, deploy:lock)'),
  timestamp: z.string().describe('Event ISO 8601 timestamp'),
  log_type: z.string().describe('Log classification type'),
});

export interface RawAuditEvent {
  id?: string;
  account_id?: string;
  payload?: {
    actor_id?: string;
    actor_name?: string;
    actor_email?: string;
    action?: string;
    timestamp?: string;
    log_type?: string;
  };
}

export const mapAuditEvent = (e: RawAuditEvent) => ({
  id: e.id ?? '',
  account_id: e.account_id ?? '',
  actor_id: e.payload?.actor_id ?? '',
  actor_name: e.payload?.actor_name ?? '',
  actor_email: e.payload?.actor_email ?? '',
  action: e.payload?.action ?? '',
  timestamp: e.payload?.timestamp ?? '',
  log_type: e.payload?.log_type ?? '',
});

// --- DeployKey ---

export const deployKeySchema = z.object({
  id: z.string().describe('Deploy key ID'),
  public_key: z.string().describe('SSH public key'),
  created_at: z.string().describe('Key creation ISO 8601 timestamp'),
});

export interface RawDeployKey {
  id?: string;
  public_key?: string;
  created_at?: string;
}

export const mapDeployKey = (k: RawDeployKey) => ({
  id: k.id ?? '',
  public_key: k.public_key ?? '',
  created_at: k.created_at ?? '',
});
