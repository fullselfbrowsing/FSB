import { z } from 'zod';

// --- Shared output schemas ---

const timestampSchema = z.string().describe('ISO 8601 timestamp');

const mapTimestamp = (ts: RawTimestamp | undefined): string => {
  if (!ts?.seconds) return '';
  const ms = Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
  return new Date(ms).toISOString();
};

// --- Raw API response types ---

interface RawTimestamp {
  seconds?: number;
  nanos?: number;
}

interface RawCloudRegion {
  id?: string;
  code?: string;
  name?: string;
  countryCode?: string;
  macroRegion?: string;
}

export interface RawClusterRegion {
  id?: string;
  clusterId?: string;
  cloudRegion?: RawCloudRegion;
  isPrimary?: boolean;
  locality?: string;
  numNodes?: number;
  sqlDns?: string;
  privateEndpointDns?: string;
  createdAt?: RawTimestamp;
  updatedAt?: RawTimestamp;
}

export interface RawCluster {
  id?: string;
  name?: string;
  cockroachVersion?: string;
  cloudProvider?: number;
  state?: number;
  billingPlan?: number;
  clusterType?: number;
  creatorId?: string;
  organizationId?: string;
  sqlDns?: string;
  regionsList?: RawClusterRegion[];
  createdAt?: RawTimestamp;
  updatedAt?: RawTimestamp;
  usageLimits?: RawUsageLimits;
  deleteProtection?: number;
  networkVisibility?: number;
  upgradeType?: number;
  parentId?: string;
  labelsMap?: Array<[string, string]>;
  actions?: RawClusterActions;
}

interface RawUsageLimits {
  monthlyRequestUnitLimit?: number;
  monthlyStorageMibLimit?: number;
  provisionedVcpusLimit?: number;
}

interface RawClusterActions {
  connectEnabled?: boolean;
  deleteEnabled?: boolean;
  scaleEnabled?: boolean;
  backupsEnabled?: boolean;
  monitoringEnabled?: boolean;
  networkingEnabled?: boolean;
  sqlUsersEnabled?: boolean;
  sqlShellEnabled?: boolean;
}

export interface RawOrganization {
  id?: string;
  name?: string;
  label?: string;
  createdAt?: RawTimestamp;
  defaultBillingPlan?: number;
  stripeCustomerId?: string;
}

export interface RawDatabaseUser {
  name?: string;
  isInternal?: boolean;
}

export interface RawUser {
  id?: string;
  email?: string;
  fullName?: string;
  status?: number;
  createdAt?: RawTimestamp;
}

export interface RawMember {
  userId?: string;
  organizationId?: string;
  role?: number;
  user?: RawUser;
  rolesList?: Array<{ name?: number; resource?: { id?: string; type?: number; name?: string } }>;
  createdAt?: RawTimestamp;
}

export interface RawInvoice {
  id?: string;
  periodStart?: RawTimestamp;
  periodEnd?: RawTimestamp;
  amountDue?: number;
  amountPaid?: number;
  status?: number;
  currency?: number;
}

// --- Cloud provider / state enum maps ---

const CLOUD_PROVIDERS: Record<number, string> = { 0: 'UNKNOWN', 1: 'AWS', 2: 'GCP', 3: 'AZURE' };
const CLUSTER_STATES: Record<number, string> = {
  0: 'UNKNOWN',
  1: 'CREATED',
  2: 'CREATING',
  3: 'DELETED',
  4: 'DELETING',
  5: 'CREATE_FAILED',
  6: 'LOCKED',
};
const BILLING_PLANS: Record<number, string> = { 0: 'UNKNOWN', 1: 'DEDICATED', 2: 'FREE', 3: 'ADVANCED', 4: 'BASIC' };

// --- Zod schemas ---

export const clusterRegionSchema = z.object({
  id: z.string().describe('Region ID'),
  cloud_region_code: z.string().describe('Cloud region code (e.g., us-west-2)'),
  cloud_region_name: z.string().describe('Human-readable region name (e.g., Oregon)'),
  is_primary: z.boolean().describe('Whether this is the primary region'),
  locality: z.string().describe('Locality string'),
  num_nodes: z.number().int().describe('Number of nodes in this region'),
  sql_dns: z.string().describe('SQL connection DNS endpoint'),
});

export const clusterSchema = z.object({
  id: z.string().describe('Cluster UUID'),
  name: z.string().describe('Cluster name'),
  cockroach_version: z.string().describe('CockroachDB version'),
  cloud_provider: z.string().describe('Cloud provider (AWS, GCP, AZURE)'),
  state: z.string().describe('Cluster state (CREATED, CREATING, DELETED, etc.)'),
  billing_plan: z.string().describe('Billing plan (BASIC, ADVANCED, DEDICATED, FREE)'),
  sql_dns: z.string().describe('SQL connection DNS endpoint'),
  regions: z.array(clusterRegionSchema).describe('List of cluster regions'),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  delete_protection: z.boolean().describe('Whether delete protection is enabled'),
});

export const clusterDetailSchema = clusterSchema.extend({
  organization_id: z.string().describe('Organization UUID'),
  creator_id: z.string().describe('Creator user UUID'),
  usage_limits: z
    .object({
      monthly_request_unit_limit: z.number().describe('Monthly request unit limit'),
      monthly_storage_mib_limit: z.number().describe('Monthly storage limit in MiB'),
      provisioned_vcpus_limit: z.number().describe('Provisioned vCPU limit'),
    })
    .describe('Usage limits for the cluster'),
});

export const organizationSchema = z.object({
  id: z.string().describe('Organization UUID'),
  name: z.string().describe('Organization name'),
  label: z.string().describe('Organization label (slug)'),
  billing_plan: z.string().describe('Default billing plan'),
  created_at: timestampSchema,
});

export const databaseUserSchema = z.object({
  name: z.string().describe('Database username'),
  is_internal: z.boolean().describe('Whether this is a system-internal user'),
});

export const userSchema = z.object({
  id: z.string().describe('User UUID'),
  email: z.string().describe('User email address'),
  full_name: z.string().describe('User full name'),
  created_at: timestampSchema,
});

export const memberSchema = z.object({
  user_id: z.string().describe('User UUID'),
  email: z.string().describe('User email address'),
  full_name: z.string().describe('User full name'),
  created_at: timestampSchema,
});

export const invoiceSchema = z.object({
  id: z.string().describe('Invoice ID'),
  period_start: timestampSchema.describe('Billing period start'),
  period_end: timestampSchema.describe('Billing period end'),
  amount_due: z.number().describe('Amount due in cents'),
  amount_paid: z.number().describe('Amount paid in cents'),
});

export const usageSchema = z.object({
  consumed_request_units: z.number().describe('Request units consumed in current period'),
  current_storage_gib: z.number().describe('Current storage usage in GiB'),
});

// --- Defensive mappers ---

export const mapClusterRegion = (r: RawClusterRegion) => ({
  id: r.id ?? '',
  cloud_region_code: r.cloudRegion?.code ?? '',
  cloud_region_name: r.cloudRegion?.name ?? '',
  is_primary: r.isPrimary ?? false,
  locality: r.locality ?? '',
  num_nodes: r.numNodes ?? 0,
  sql_dns: r.sqlDns ?? '',
});

export const mapCluster = (c: RawCluster) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  cockroach_version: c.cockroachVersion ?? '',
  cloud_provider: CLOUD_PROVIDERS[c.cloudProvider ?? 0] ?? 'UNKNOWN',
  state: CLUSTER_STATES[c.state ?? 0] ?? 'UNKNOWN',
  billing_plan: BILLING_PLANS[c.billingPlan ?? 0] ?? 'UNKNOWN',
  sql_dns: c.sqlDns ?? '',
  regions: (c.regionsList ?? []).map(mapClusterRegion),
  created_at: mapTimestamp(c.createdAt),
  updated_at: mapTimestamp(c.updatedAt),
  delete_protection: c.deleteProtection === 1,
});

export const mapClusterDetail = (c: RawCluster) => ({
  ...mapCluster(c),
  organization_id: c.organizationId ?? '',
  creator_id: c.creatorId ?? '',
  usage_limits: {
    monthly_request_unit_limit: c.usageLimits?.monthlyRequestUnitLimit ?? 0,
    monthly_storage_mib_limit: c.usageLimits?.monthlyStorageMibLimit ?? 0,
    provisioned_vcpus_limit: c.usageLimits?.provisionedVcpusLimit ?? 0,
  },
});

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? '',
  name: o.name ?? '',
  label: o.label ?? '',
  billing_plan: BILLING_PLANS[o.defaultBillingPlan ?? 0] ?? 'UNKNOWN',
  created_at: mapTimestamp(o.createdAt),
});

export const mapDatabaseUser = (u: RawDatabaseUser) => ({
  name: u.name ?? '',
  is_internal: u.isInternal ?? false,
});

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  email: u.email ?? '',
  full_name: u.fullName ?? '',
  created_at: mapTimestamp(u.createdAt),
});

export const mapMember = (m: RawMember) => ({
  user_id: m.userId ?? '',
  email: m.user?.email ?? '',
  full_name: m.user?.fullName ?? '',
  created_at: mapTimestamp(m.createdAt),
});

export const mapInvoice = (i: RawInvoice) => ({
  id: i.id ?? '',
  period_start: mapTimestamp(i.periodStart),
  period_end: mapTimestamp(i.periodEnd),
  amount_due: i.amountDue ?? 0,
  amount_paid: i.amountPaid ?? 0,
});
