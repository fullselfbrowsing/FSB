import { z } from 'zod';

// --- User / Account ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  email: z.string().describe('Email address'),
});

export interface RawUser {
  id?: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  username?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  first_name: u.firstName ?? '',
  last_name: u.lastName ?? '',
  email: u.emailAddress ?? u.username ?? '',
});

// --- Organization ---

export const organizationSchema = z.object({
  id: z.string().describe('Organization ID'),
  name: z.string().describe('Organization name'),
  plan_type: z.string().describe('Plan type (e.g., NDS for Atlas)'),
  created: z.string().describe('ISO 8601 creation timestamp'),
  is_atlas: z.boolean().describe('Whether this is an Atlas organization'),
  mfa_required: z.boolean().describe('Whether multi-factor auth is required'),
  payment_status: z.string().describe('Payment status (e.g., OK, DEAD)'),
  gen_ai_enabled: z.boolean().describe('Whether GenAI features are enabled'),
});

export interface RawOrganization {
  id?: string;
  name?: string;
  planType?: string;
  created?: string;
  atlas?: boolean;
  multiFactorAuthRequired?: boolean;
  paymentStatus?: { status?: string };
  genAIFeaturesEnabled?: boolean;
}

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? '',
  name: o.name ?? '',
  plan_type: o.planType ?? '',
  created: o.created ?? '',
  is_atlas: o.atlas ?? false,
  mfa_required: o.multiFactorAuthRequired ?? false,
  payment_status: o.paymentStatus?.status ?? '',
  gen_ai_enabled: o.genAIFeaturesEnabled ?? false,
});

// --- Organization Member ---

export const orgMemberSchema = z.object({
  user_id: z.string().describe('User ID'),
  email: z.string().describe('Email address'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  roles: z.array(z.string()).describe('Organization roles (e.g., ORG_OWNER, ORG_MEMBER)'),
  status: z.string().describe('Membership status (e.g., CONFIRMED, PENDING)'),
  created: z.string().describe('ISO 8601 creation timestamp'),
  last_auth: z.string().describe('ISO 8601 timestamp of last authentication'),
});

export interface RawOrgMember {
  userId?: string;
  emailAddress?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  status?: string;
  created?: string;
  lastAuth?: string;
}

export const mapOrgMember = (m: RawOrgMember) => ({
  user_id: (m.userId ?? '').replace('@', ''),
  email: m.emailAddress ?? m.username ?? '',
  first_name: m.firstName ?? '',
  last_name: m.lastName ?? '',
  roles: m.roles ?? [],
  status: m.status ?? '',
  created: m.created ?? '',
  last_auth: m.lastAuth ?? '',
});

// --- Organization Project ---

export const orgProjectSchema = z.object({
  id: z.string().describe('Project (group) ID'),
  name: z.string().describe('Project name'),
  cluster_count: z.number().int().describe('Number of clusters'),
  user_count: z.number().int().describe('Number of users'),
  alert_count: z.number().int().describe('Number of active alerts'),
});

export interface RawOrgProject {
  id?: string;
  name?: string;
  numCluster?: number;
  users?: number;
  alerts?: number;
}

export const mapOrgProject = (p: RawOrgProject) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  cluster_count: p.numCluster ?? 0,
  user_count: p.users ?? 0,
  alert_count: p.alerts ?? 0,
});

// --- Project ---

export const projectSchema = z.object({
  id: z.string().describe('Project (group) ID'),
  name: z.string().describe('Project name'),
  state: z.string().describe('Project state (e.g., IDLE, ACTIVE)'),
  group_type: z.string().describe('Group type (e.g., NDS for Atlas)'),
  cluster_count: z.number().int().describe('Number of clusters'),
  data_size_bytes: z.number().describe('Total data size backed up in bytes'),
});

export interface RawProject {
  id?: string;
  groupName?: string;
  state?: string;
  groupType?: string;
  summaryStatistics?: { numCluster?: number; dataSizeBackedUpBytes?: number };
}

export const mapProject = (p: RawProject) => ({
  id: p.id ?? '',
  name: p.groupName ?? '',
  state: p.state ?? '',
  group_type: p.groupType ?? '',
  cluster_count: p.summaryStatistics?.numCluster ?? 0,
  data_size_bytes: p.summaryStatistics?.dataSizeBackedUpBytes ?? 0,
});

// --- Cluster ---

export const clusterSchema = z.object({
  id: z.string().describe('Cluster ID'),
  name: z.string().describe('Cluster name'),
  cluster_type: z.string().describe('Cluster type (REPLICASET, SHARDED, GEOSHARDED)'),
  state: z.string().describe('Cluster state (e.g., IDLE, CREATING, UPDATING, DELETING)'),
  mongodb_version: z.string().describe('MongoDB version'),
  provider: z.string().describe('Cloud provider (AWS, GCP, AZURE, TENANT)'),
  region: z.string().describe('Region name'),
  instance_size: z.string().describe('Instance size (e.g., M0, M10, M30)'),
  connection_string: z.string().describe('Standard connection string (SRV)'),
  paused: z.boolean().describe('Whether the cluster is paused'),
  disk_size_gb: z.number().describe('Disk size in GB'),
});

export interface RawCluster {
  id?: string;
  name?: string;
  clusterType?: string;
  stateName?: string;
  mongoDBVersion?: string;
  providerSettings?: {
    providerName?: string;
    backingProviderName?: string;
    regionName?: string;
    instanceSizeName?: string;
  };
  connectionStrings?: { standardSrv?: string };
  paused?: boolean;
  diskSizeGB?: number;
}

export const mapCluster = (c: RawCluster) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  cluster_type: c.clusterType ?? '',
  state: c.stateName ?? '',
  mongodb_version: c.mongoDBVersion ?? '',
  provider: c.providerSettings?.backingProviderName ?? c.providerSettings?.providerName ?? '',
  region: c.providerSettings?.regionName ?? '',
  instance_size: c.providerSettings?.instanceSizeName ?? '',
  connection_string: c.connectionStrings?.standardSrv ?? '',
  paused: c.paused ?? false,
  disk_size_gb: c.diskSizeGB ?? 0,
});

// --- Database User ---

export const dbUserSchema = z.object({
  username: z.string().describe('Database username'),
  database: z.string().describe('Authentication database (e.g., admin)'),
  roles: z
    .array(
      z.object({
        role_name: z.string().describe('Role name (e.g., readWriteAnyDatabase, atlasAdmin)'),
        database_name: z.string().describe('Database the role applies to'),
      }),
    )
    .describe('Assigned roles'),
  scopes: z
    .array(
      z.object({
        name: z.string().describe('Scope name (cluster name)'),
        type: z.string().describe('Scope type (CLUSTER)'),
      }),
    )
    .describe('Access scopes (which clusters this user can access)'),
  auth_type: z.string().describe('Authentication type (SCRAM, X509, LDAP, AWS_IAM)'),
});

export interface RawDbUser {
  user?: string;
  db?: string;
  roles?: Array<{ roleName?: string; databaseName?: string }>;
  scopes?: Array<{ name?: string; type?: string }>;
  awsIAMType?: string;
  x509Type?: string;
  ldapAuthType?: string;
}

export const mapDbUser = (u: RawDbUser) => {
  let authType = 'SCRAM';
  if (u.awsIAMType && u.awsIAMType !== 'NONE') authType = 'AWS_IAM';
  else if (u.x509Type && u.x509Type !== 'NONE') authType = 'X509';
  else if (u.ldapAuthType && u.ldapAuthType !== 'NONE') authType = 'LDAP';
  return {
    username: u.user ?? '',
    database: u.db ?? 'admin',
    roles: (u.roles ?? []).map(r => ({
      role_name: r.roleName ?? '',
      database_name: r.databaseName ?? '',
    })),
    scopes: (u.scopes ?? []).map(s => ({
      name: s.name ?? '',
      type: s.type ?? '',
    })),
    auth_type: authType,
  };
};

// --- IP Access List Entry ---

export const ipAccessEntrySchema = z.object({
  ip_address: z.string().describe('IP address or CIDR block'),
  comment: z.string().describe('Description of the entry'),
  group_id: z.string().describe('Project ID this entry belongs to'),
});

export interface RawIpAccessEntry {
  ipAddress?: string;
  cidrBlock?: string;
  comment?: string;
  groupId?: string;
}

export const mapIpAccessEntry = (e: RawIpAccessEntry) => ({
  ip_address: e.cidrBlock ?? e.ipAddress ?? '',
  comment: e.comment ?? '',
  group_id: e.groupId ?? '',
});

// --- Alert ---

export const alertSchema = z.object({
  id: z.string().describe('Alert ID'),
  event_type: z.string().describe('Event type that triggered the alert'),
  status: z.string().describe('Alert status (OPEN, CLOSED, TRACKING)'),
  created: z.string().describe('ISO 8601 timestamp when the alert was created'),
  cluster_name: z.string().describe('Name of the affected cluster'),
  metric_name: z.string().describe('Metric name if metric-based alert'),
});

export interface RawAlert {
  id?: string;
  eventTypeName?: string;
  status?: string;
  created?: string;
  clusterName?: string;
  metricName?: string;
}

export const mapAlert = (a: RawAlert) => ({
  id: a.id ?? '',
  event_type: a.eventTypeName ?? '',
  status: a.status ?? '',
  created: a.created ?? '',
  cluster_name: a.clusterName ?? '',
  metric_name: a.metricName ?? '',
});

// --- Alert Config ---

export const alertConfigSchema = z.object({
  id: z.string().describe('Alert configuration ID'),
  event_type: z.string().describe('Event type (e.g., NO_PRIMARY, OUTSIDE_METRIC_THRESHOLD)'),
  enabled: z.boolean().describe('Whether this alert configuration is active'),
  type: z.string().describe('Alert type (e.g., NDS, REPLICA_SET, HOST_METRIC, CLUSTER)'),
  created: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawAlertConfig {
  id?: string;
  et?: string;
  enabled?: boolean;
  _t?: string;
  cre?: string;
}

export const mapAlertConfig = (c: RawAlertConfig) => ({
  id: c.id ?? '',
  event_type: c.et ?? '',
  enabled: c.enabled ?? false,
  type: c._t ?? '',
  created: c.cre ?? '',
});

// --- Team ---

export const teamSchema = z.object({
  id: z.string().describe('Team ID'),
  name: z.string().describe('Team name'),
  user_count: z.number().int().describe('Number of members in the team'),
});

export interface RawTeam {
  id?: string;
  name?: string;
  userCount?: number;
}

export const mapTeam = (t: RawTeam) => ({
  id: t.id ?? '',
  name: t.name ?? '',
  user_count: t.userCount ?? 0,
});

// --- Network Peering ---

export const peeringSchema = z.object({
  id: z.string().describe('Peering connection ID'),
  provider: z.string().describe('Cloud provider (AWS, GCP, AZURE)'),
  status: z.string().describe('Peering status'),
  vpc_id: z.string().describe('VPC/VNet ID'),
  cidr_block: z.string().describe('CIDR block'),
});

export interface RawPeering {
  id?: string;
  providerName?: string;
  statusName?: string;
  vpcId?: string;
  routeTableCidrBlock?: string;
  azureDirectoryId?: string;
  gcpProjectId?: string;
}

export const mapPeering = (p: RawPeering) => ({
  id: p.id ?? '',
  provider: p.providerName ?? '',
  status: p.statusName ?? '',
  vpc_id: p.vpcId ?? p.azureDirectoryId ?? p.gcpProjectId ?? '',
  cidr_block: p.routeTableCidrBlock ?? '',
});

// --- Deployment Status ---

export const deploymentStatusSchema = z.object({
  is_in_goal_state: z.boolean().describe('Whether the deployment has reached its goal state'),
  has_version_conflict: z.boolean().describe('Whether there is a version conflict'),
  is_draft: z.boolean().describe('Whether the deployment is a draft'),
  jobs_in_progress: z.boolean().describe('Whether there are jobs currently in progress'),
  process_count: z.number().int().describe('Number of managed processes'),
});

export interface RawDeploymentStatus {
  isInGoalState?: boolean;
  hasVersionConflict?: boolean;
  isDraft?: boolean;
  areJobsInProgress?: boolean;
  automationStatus?: { processes?: unknown[] };
}

export const mapDeploymentStatus = (d: RawDeploymentStatus) => ({
  is_in_goal_state: d.isInGoalState ?? true,
  has_version_conflict: d.hasVersionConflict ?? false,
  is_draft: d.isDraft ?? false,
  jobs_in_progress: d.areJobsInProgress ?? false,
  process_count: d.automationStatus?.processes?.length ?? 0,
});

// --- Billing Plan ---

export const billingPlanSchema = z.object({
  plan_type: z.string().describe('Plan type'),
  plan_name: z.string().describe('Plan display name'),
  is_paid: z.boolean().describe('Whether this is a paid plan'),
});

export interface RawBillingPlan {
  planType?: string;
  planName?: string;
  isPaid?: boolean;
}

export const mapBillingPlan = (p: RawBillingPlan) => ({
  plan_type: p.planType ?? '',
  plan_name: p.planName ?? '',
  is_paid: p.isPaid ?? false,
});
