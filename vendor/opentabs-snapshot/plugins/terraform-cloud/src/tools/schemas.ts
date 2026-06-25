import { z } from 'zod';

// --- Pagination ---

export const paginationInput = z.object({
  page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
});

export const paginationOutput = z.object({
  current_page: z.number().describe('Current page number'),
  total_pages: z.number().describe('Total number of pages'),
  total_count: z.number().describe('Total number of results'),
});

// --- Raw interfaces ---

export interface RawPagination {
  'current-page'?: number;
  'next-page'?: number | null;
  'prev-page'?: number | null;
  'total-pages'?: number;
  'total-count'?: number;
}

export interface RawUser {
  username?: string;
  email?: string;
  'avatar-url'?: string;
  'is-confirmed'?: boolean;
  'two-factor'?: { enabled?: boolean; verified?: boolean };
  'auth-method'?: string;
  permissions?: Record<string, boolean>;
}

export interface RawOrganization {
  name?: string;
  email?: string;
  'external-id'?: string;
  'created-at'?: string;
  'plan-identifier'?: string;
  'plan-is-trial'?: boolean;
  'plan-is-enterprise'?: boolean;
  'cost-estimation-enabled'?: boolean;
  'default-execution-mode'?: string;
  'managed-resource-count'?: number;
  'collaborator-auth-policy'?: string;
  'saml-enabled'?: boolean;
  permissions?: Record<string, boolean>;
}

export interface RawWorkspace {
  name?: string;
  description?: string;
  'auto-apply'?: boolean;
  'created-at'?: string;
  'updated-at'?: string;
  'execution-mode'?: string;
  'file-triggers-enabled'?: boolean;
  locked?: boolean;
  'resource-count'?: number;
  'terraform-version'?: string;
  'working-directory'?: string;
  'vcs-repo'?: {
    identifier?: string;
    branch?: string;
    'display-identifier'?: string;
  } | null;
  'current-run'?: {
    id?: string;
    status?: string;
  } | null;
  permissions?: Record<string, boolean>;
}

export interface RawProject {
  name?: string;
  description?: string | null;
  'created-at'?: string;
  'workspace-count'?: number;
  'team-count'?: number;
  'stack-count'?: number;
  permissions?: Record<string, boolean>;
}

export interface RawRun {
  status?: string;
  message?: string;
  source?: string;
  'created-at'?: string;
  'is-destroy'?: boolean;
  'has-changes'?: boolean;
  'auto-apply'?: boolean;
  'plan-only'?: boolean;
  'refresh-only'?: boolean;
  'terraform-version'?: string;
  'status-timestamps'?: Record<string, string>;
  actions?: Record<string, boolean>;
}

export interface RawPlan {
  status?: string;
  'has-changes'?: boolean;
  'resource-additions'?: number;
  'resource-changes'?: number;
  'resource-destructions'?: number;
  'resource-imports'?: number;
  'log-read-url'?: string;
}

export interface RawApply {
  status?: string;
  'resource-additions'?: number;
  'resource-changes'?: number;
  'resource-destructions'?: number;
  'resource-imports'?: number;
  'log-read-url'?: string;
}

export interface RawStateVersion {
  'created-at'?: string;
  serial?: number;
  status?: string;
  'hosted-state-download-url'?: string;
  'hosted-state-upload-url'?: string;
  'resources-processed'?: boolean;
  'terraform-version'?: string;
  size?: number;
  modules?: { root?: { resources?: unknown[] } };
}

export interface RawVariable {
  key?: string;
  value?: string | null;
  sensitive?: boolean;
  category?: string;
  hcl?: boolean;
  description?: string | null;
  'created-at'?: string;
}

export interface RawVariableSet {
  name?: string;
  description?: string | null;
  global?: boolean;
  priority?: boolean;
  'created-at'?: string;
  'updated-at'?: string;
  'workspace-count'?: number;
  'project-count'?: number;
  'var-count'?: number;
}

export interface RawTeam {
  name?: string;
  'users-count'?: number;
  visibility?: string;
  'sso-team-id'?: string | null;
  'allow-member-token-management'?: boolean;
  permissions?: Record<string, boolean>;
}

export interface RawTeamAccess {
  access?: string;
  runs?: string;
  variables?: string;
  'state-versions'?: string;
  'sentinel-mocks'?: string;
  'workspace-locking'?: boolean;
  'run-tasks'?: boolean;
}

export interface RawOrganizationMembership {
  status?: string;
  email?: string;
  'created-at'?: string;
}

// --- Zod schemas ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  username: z.string().describe('Username'),
  email: z.string().describe('Email address'),
  avatar_url: z.string().describe('Gravatar URL'),
  is_confirmed: z.boolean().describe('Whether email is confirmed'),
  two_factor_enabled: z.boolean().describe('Whether 2FA is enabled'),
  auth_method: z.string().describe('Authentication method (e.g., "tfc")'),
});

export const organizationSchema = z.object({
  id: z.string().describe('Organization name (used as ID)'),
  external_id: z.string().describe('External organization ID'),
  name: z.string().describe('Organization name'),
  email: z.string().describe('Organization email'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  plan: z.string().describe('Plan identifier (e.g., "free_standard")'),
  execution_mode: z.string().describe('Default execution mode'),
  managed_resource_count: z.number().describe('Number of managed resources'),
  cost_estimation_enabled: z.boolean().describe('Whether cost estimation is enabled'),
  saml_enabled: z.boolean().describe('Whether SAML SSO is enabled'),
});

export const workspaceSchema = z.object({
  id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  name: z.string().describe('Workspace name'),
  description: z.string().describe('Workspace description'),
  auto_apply: z.boolean().describe('Whether runs auto-apply after plan'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  execution_mode: z.string().describe('Execution mode: remote, local, or agent'),
  locked: z.boolean().describe('Whether the workspace is locked'),
  resource_count: z.number().describe('Number of managed resources'),
  terraform_version: z.string().describe('Terraform version constraint'),
  working_directory: z.string().describe('Working directory for Terraform'),
  vcs_repo: z.string().describe('VCS repository identifier (e.g., "org/repo"), empty if not connected'),
});

export const projectSchema = z.object({
  id: z.string().describe('Project ID (e.g., "prj-...")'),
  name: z.string().describe('Project name'),
  description: z.string().describe('Project description'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  workspace_count: z.number().describe('Number of workspaces in the project'),
  team_count: z.number().describe('Number of teams with access'),
});

export const runSchema = z.object({
  id: z.string().describe('Run ID (e.g., "run-...")'),
  status: z
    .string()
    .describe(
      'Run status (e.g., "pending", "planning", "planned", "applying", "applied", "errored", "canceled", "discarded")',
    ),
  message: z.string().describe('Run message'),
  source: z.string().describe('Run source (e.g., "tfe-api", "tfe-ui", "terraform+cloud")'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  is_destroy: z.boolean().describe('Whether this is a destroy run'),
  has_changes: z.boolean().describe('Whether the plan detected changes'),
  auto_apply: z.boolean().describe('Whether auto-apply is enabled'),
  plan_only: z.boolean().describe('Whether this is a plan-only run'),
  terraform_version: z.string().describe('Terraform version used'),
  confirmable: z.boolean().describe('Whether the run can be confirmed/applied'),
  cancelable: z.boolean().describe('Whether the run can be canceled'),
  discardable: z.boolean().describe('Whether the run can be discarded'),
});

export const planSchema = z.object({
  id: z.string().describe('Plan ID (e.g., "plan-...")'),
  status: z.string().describe('Plan status (e.g., "pending", "running", "finished", "errored")'),
  has_changes: z.boolean().describe('Whether the plan detected changes'),
  resource_additions: z.number().describe('Number of resources to add'),
  resource_changes: z.number().describe('Number of resources to change'),
  resource_destructions: z.number().describe('Number of resources to destroy'),
  resource_imports: z.number().describe('Number of resources to import'),
  log_read_url: z.string().describe('URL to read plan log output'),
});

export const applySchema = z.object({
  id: z.string().describe('Apply ID (e.g., "apply-...")'),
  status: z.string().describe('Apply status (e.g., "pending", "running", "finished", "errored")'),
  resource_additions: z.number().describe('Number of resources added'),
  resource_changes: z.number().describe('Number of resources changed'),
  resource_destructions: z.number().describe('Number of resources destroyed'),
  resource_imports: z.number().describe('Number of resources imported'),
  log_read_url: z.string().describe('URL to read apply log output'),
});

export const stateVersionSchema = z.object({
  id: z.string().describe('State version ID (e.g., "sv-...")'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  serial: z.number().describe('State serial number'),
  status: z.string().describe('State status (e.g., "finalized", "pending")'),
  terraform_version: z.string().describe('Terraform version used'),
  size: z.number().describe('State file size in bytes'),
  resources_processed: z.boolean().describe('Whether resources were processed'),
});

export const variableSchema = z.object({
  id: z.string().describe('Variable ID (e.g., "var-...")'),
  key: z.string().describe('Variable key name'),
  value: z.string().describe('Variable value (empty string if sensitive)'),
  sensitive: z.boolean().describe('Whether the variable is sensitive'),
  category: z.string().describe('Variable category: "terraform" or "env"'),
  hcl: z.boolean().describe('Whether the value is HCL'),
  description: z.string().describe('Variable description'),
});

export const variableSetSchema = z.object({
  id: z.string().describe('Variable set ID (e.g., "varset-...")'),
  name: z.string().describe('Variable set name'),
  description: z.string().describe('Variable set description'),
  global: z.boolean().describe('Whether applied to all workspaces'),
  priority: z.boolean().describe('Whether this set takes priority over workspace variables'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  workspace_count: z.number().describe('Number of workspaces using this set'),
  project_count: z.number().describe('Number of projects using this set'),
  var_count: z.number().describe('Number of variables in this set'),
});

export const teamSchema = z.object({
  id: z.string().describe('Team ID (e.g., "team-...")'),
  name: z.string().describe('Team name'),
  users_count: z.number().describe('Number of members'),
  visibility: z.string().describe('Team visibility: "secret" or "organization"'),
  sso_team_id: z.string().describe('SSO team ID mapping'),
});

export const teamAccessSchema = z.object({
  id: z.string().describe('Team access ID'),
  team_id: z.string().describe('Team ID'),
  workspace_id: z.string().describe('Workspace ID'),
  access: z.string().describe('Access level: "read", "plan", "write", "admin", or "custom"'),
  runs: z.string().describe('Run access: "read", "plan", or "apply"'),
  variables: z.string().describe('Variable access: "none", "read", or "write"'),
  state_versions: z.string().describe('State access: "none", "read", "read-outputs", or "write"'),
});

export const organizationMembershipSchema = z.object({
  id: z.string().describe('Membership ID'),
  status: z.string().describe('Membership status: "active" or "invited"'),
  email: z.string().describe('Member email address'),
  user_id: z.string().describe('User ID if active, empty if invited'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

// --- Defensive mappers ---

export const mapPagination = (p?: RawPagination) => ({
  current_page: p?.['current-page'] ?? 1,
  total_pages: p?.['total-pages'] ?? 0,
  total_count: p?.['total-count'] ?? 0,
});

export const mapUser = (id: string, u: RawUser) => ({
  id,
  username: u.username ?? '',
  email: u.email ?? '',
  avatar_url: u['avatar-url'] ?? '',
  is_confirmed: u['is-confirmed'] ?? false,
  two_factor_enabled: u['two-factor']?.enabled ?? false,
  auth_method: u['auth-method'] ?? '',
});

export const mapOrganization = (id: string, o: RawOrganization) => ({
  id,
  external_id: o['external-id'] ?? '',
  name: o.name ?? '',
  email: o.email ?? '',
  created_at: o['created-at'] ?? '',
  plan: o['plan-identifier'] ?? '',
  execution_mode: o['default-execution-mode'] ?? '',
  managed_resource_count: o['managed-resource-count'] ?? 0,
  cost_estimation_enabled: o['cost-estimation-enabled'] ?? false,
  saml_enabled: o['saml-enabled'] ?? false,
});

export const mapWorkspace = (id: string, w: RawWorkspace) => ({
  id,
  name: w.name ?? '',
  description: w.description ?? '',
  auto_apply: w['auto-apply'] ?? false,
  created_at: w['created-at'] ?? '',
  updated_at: w['updated-at'] ?? '',
  execution_mode: w['execution-mode'] ?? '',
  locked: w.locked ?? false,
  resource_count: w['resource-count'] ?? 0,
  terraform_version: w['terraform-version'] ?? '',
  working_directory: w['working-directory'] ?? '',
  vcs_repo: w['vcs-repo']?.identifier ?? '',
});

export const mapProject = (id: string, p: RawProject) => ({
  id,
  name: p.name ?? '',
  description: p.description ?? '',
  created_at: p['created-at'] ?? '',
  workspace_count: p['workspace-count'] ?? 0,
  team_count: p['team-count'] ?? 0,
});

export const mapRun = (id: string, r: RawRun) => ({
  id,
  status: r.status ?? '',
  message: r.message ?? '',
  source: r.source ?? '',
  created_at: r['created-at'] ?? '',
  is_destroy: r['is-destroy'] ?? false,
  has_changes: r['has-changes'] ?? false,
  auto_apply: r['auto-apply'] ?? false,
  plan_only: r['plan-only'] ?? false,
  terraform_version: r['terraform-version'] ?? '',
  confirmable: r.actions?.['is-confirmable'] ?? false,
  cancelable: r.actions?.['is-cancelable'] ?? false,
  discardable: r.actions?.['is-discardable'] ?? false,
});

export const mapPlan = (id: string, p: RawPlan) => ({
  id,
  status: p.status ?? '',
  has_changes: p['has-changes'] ?? false,
  resource_additions: p['resource-additions'] ?? 0,
  resource_changes: p['resource-changes'] ?? 0,
  resource_destructions: p['resource-destructions'] ?? 0,
  resource_imports: p['resource-imports'] ?? 0,
  log_read_url: p['log-read-url'] ?? '',
});

export const mapApply = (id: string, a: RawApply) => ({
  id,
  status: a.status ?? '',
  resource_additions: a['resource-additions'] ?? 0,
  resource_changes: a['resource-changes'] ?? 0,
  resource_destructions: a['resource-destructions'] ?? 0,
  resource_imports: a['resource-imports'] ?? 0,
  log_read_url: a['log-read-url'] ?? '',
});

export const mapStateVersion = (id: string, s: RawStateVersion) => ({
  id,
  created_at: s['created-at'] ?? '',
  serial: s.serial ?? 0,
  status: s.status ?? '',
  terraform_version: s['terraform-version'] ?? '',
  size: s.size ?? 0,
  resources_processed: s['resources-processed'] ?? false,
});

export const mapVariable = (id: string, v: RawVariable) => ({
  id,
  key: v.key ?? '',
  value: v.value ?? '',
  sensitive: v.sensitive ?? false,
  category: v.category ?? '',
  hcl: v.hcl ?? false,
  description: v.description ?? '',
});

export const mapVariableSet = (id: string, vs: RawVariableSet) => ({
  id,
  name: vs.name ?? '',
  description: vs.description ?? '',
  global: vs.global ?? false,
  priority: vs.priority ?? false,
  created_at: vs['created-at'] ?? '',
  workspace_count: vs['workspace-count'] ?? 0,
  project_count: vs['project-count'] ?? 0,
  var_count: vs['var-count'] ?? 0,
});

export const mapTeam = (id: string, t: RawTeam) => ({
  id,
  name: t.name ?? '',
  users_count: t['users-count'] ?? 0,
  visibility: t.visibility ?? '',
  sso_team_id: t['sso-team-id'] ?? '',
});

export const mapTeamAccess = (id: string, a: RawTeamAccess, teamId: string, workspaceId: string) => ({
  id,
  team_id: teamId,
  workspace_id: workspaceId,
  access: a.access ?? '',
  runs: a.runs ?? '',
  variables: a.variables ?? '',
  state_versions: a['state-versions'] ?? '',
});

export const mapOrganizationMembership = (id: string, m: RawOrganizationMembership, userId: string) => ({
  id,
  status: m.status ?? '',
  email: m.email ?? '',
  user_id: userId,
  created_at: m['created-at'] ?? '',
});
