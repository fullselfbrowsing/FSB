import { z } from 'zod';

// --- Zod schemas ---

export const organizationSchema = z.object({
  id: z.string().describe('Organization UUID'),
  name: z.string().describe('Organization name'),
  billing_status: z.string().describe('Billing status (e.g., "IN_TRIAL", "active", "suspended")'),
  tier: z.string().describe('Organization tier (e.g., "BASIC", "SCALE", "ENTERPRISE")'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  trial_remaining_days: z.number().describe('Days remaining in trial period, or 0 if not on trial'),
  trial_amount_remaining: z.number().describe('Trial credit remaining in dollars, or 0 if not on trial'),
});

const endpointSchema = z.object({
  protocol: z.string().describe('Endpoint protocol (e.g., "nativesecure", "https")'),
  hostname: z.string().describe('Endpoint hostname'),
  port: z.number().describe('Endpoint port number'),
});

const ipAccessEntrySchema = z.object({
  source: z.string().describe('IP address or CIDR range'),
  description: z.string().describe('Description of this IP access entry'),
});

export const serviceSchema = z.object({
  id: z.string().describe('Service UUID'),
  name: z.string().describe('Service name'),
  state: z.string().describe('Service state (e.g., "running", "idle", "stopped", "provisioning")'),
  region: z.string().describe('Cloud region ID (e.g., "gcp-us-east1", "aws-us-east-1")'),
  cloud_provider: z.string().describe('Cloud provider (e.g., "aws", "gcp", "azure")'),
  clickhouse_version: z.string().describe('ClickHouse server version'),
  endpoints: z.array(endpointSchema).describe('Connection endpoints'),
  min_replica_memory_gb: z.number().describe('Minimum replica memory in GB'),
  max_replica_memory_gb: z.number().describe('Maximum replica memory in GB'),
  num_replicas: z.number().describe('Number of replicas (minReplicas..maxReplicas)'),
  idle_scaling: z.boolean().describe('Whether idle scaling (auto-suspend) is enabled'),
  idle_timeout_minutes: z.number().describe('Minutes of inactivity before idle suspension'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  data_warehouse_id: z.string().describe('Data warehouse UUID, or empty string if not linked'),
  is_primary: z.boolean().describe('Whether this is the primary service in the warehouse'),
  is_readonly: z.boolean().describe('Whether this is a read-only replica'),
  release_channel: z.string().describe('Release channel (e.g., "regular", "fast")'),
  ip_access_list: z.array(ipAccessEntrySchema).describe('IP access list entries'),
});

export const memberSchema = z.object({
  user_id: z.string().describe('Member user ID'),
  name: z.string().describe('Member display name'),
  email: z.string().describe('Member email address'),
  role: z.string().describe('Organization role (e.g., "ADMIN", "DEVELOPER")'),
  joined_at: z.string().describe('Joined ISO 8601 timestamp'),
});

export const backupSchema = z.object({
  id: z.string().describe('Backup UUID'),
  status: z.string().describe('Backup status (e.g., "done", "in_progress", "error")'),
  started_at: z.string().describe('Backup started ISO 8601 timestamp'),
  finished_at: z.string().describe('Backup finished ISO 8601 timestamp, or empty string if in progress'),
  size_bytes: z.number().describe('Backup size in bytes'),
  duration_seconds: z.number().describe('Backup duration in seconds'),
  type: z.string().describe('Backup type (e.g., "full", "incremental")'),
});

export const metricDataPointSchema = z.object({
  timestamp: z.number().describe('Data point Unix timestamp in milliseconds'),
  value: z.number().describe('Metric value at this timestamp'),
});

export const statusSummarySchema = z.object({
  status: z
    .string()
    .describe('Overall platform status (e.g., "operational", "degraded_performance", "partial_outage")'),
  active_incidents: z.number().describe('Number of currently active incidents'),
  active_maintenances: z.number().describe('Number of currently active maintenances'),
});

// --- Raw interfaces ---
// The internal control-plane API returns camelCase fields.

export interface RawOrganization {
  id?: string;
  name?: string;
  billingStatus?: string;
  tier?: string;
  createdAt?: number;
  cachedCommitmentState?: {
    TRIAL?: {
      timeRemainingInDays?: number;
      amountRemaining?: number;
    };
  };
}

interface RawEndpoint {
  protocol?: string;
  hostname?: string;
  port?: number;
}

interface RawIpAccessEntry {
  source?: string;
  description?: string;
}

export interface RawService {
  id?: string;
  name?: string;
  state?: string;
  regionId?: string;
  cloudProvider?: string;
  clickhouseVersion?: string;
  endpoints?: Record<string, RawEndpoint>;
  minAutoScalingReplicaMemory?: number;
  maxAutoScalingReplicaMemory?: number;
  minReplicas?: number;
  maxReplicas?: number;
  enableIdleScaling?: boolean;
  idleTimeoutMinutes?: number;
  creationDate?: number;
  dataWarehouseId?: string;
  isPrimary?: boolean;
  isReadonly?: boolean;
  releaseChannel?: string;
  ipAccessList?: RawIpAccessEntry[];
}

export interface RawMember {
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  joinedAt?: number;
}

export interface RawBackup {
  id?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  sizeInBytes?: number;
  durationInSeconds?: number;
  type?: string;
}

interface RawStatusPage {
  ongoing_incidents?: unknown[];
  in_progress_maintenances?: unknown[];
  status?: { indicator?: string };
}

// --- Defensive mappers ---

const toISOString = (val: string | number | undefined | null): string => {
  if (!val) return '';
  if (typeof val === 'number') return new Date(val).toISOString();
  return val;
};

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? '',
  name: o.name ?? '',
  billing_status: o.billingStatus ?? '',
  tier: o.tier ?? '',
  created_at: toISOString(o.createdAt),
  trial_remaining_days: o.cachedCommitmentState?.TRIAL?.timeRemainingInDays ?? 0,
  trial_amount_remaining: o.cachedCommitmentState?.TRIAL?.amountRemaining ?? 0,
});

const mapEndpoint = (protocol: string, e: RawEndpoint) => ({
  protocol,
  hostname: e.hostname ?? '',
  port: e.port ?? 0,
});

const mapIpAccessEntry = (e: RawIpAccessEntry) => ({
  source: e.source ?? '',
  description: e.description ?? '',
});

export const mapService = (s: RawService) => {
  const endpoints = s.endpoints ? Object.entries(s.endpoints).map(([protocol, ep]) => mapEndpoint(protocol, ep)) : [];

  return {
    id: s.id ?? '',
    name: s.name ?? '',
    state: s.state ?? '',
    region: s.regionId ?? '',
    cloud_provider: s.cloudProvider ?? '',
    clickhouse_version: s.clickhouseVersion ?? '',
    endpoints,
    min_replica_memory_gb: s.minAutoScalingReplicaMemory ?? 0,
    max_replica_memory_gb: s.maxAutoScalingReplicaMemory ?? 0,
    num_replicas: s.maxReplicas ?? s.minReplicas ?? 0,
    idle_scaling: s.enableIdleScaling ?? false,
    idle_timeout_minutes: s.idleTimeoutMinutes ?? 0,
    created_at: toISOString(s.creationDate),
    data_warehouse_id: s.dataWarehouseId ?? '',
    is_primary: s.isPrimary ?? false,
    is_readonly: s.isReadonly ?? false,
    release_channel: s.releaseChannel ?? '',
    ip_access_list: (s.ipAccessList ?? []).map(mapIpAccessEntry),
  };
};

export const mapMember = (m: RawMember) => ({
  user_id: m.userId ?? '',
  name: m.name ?? '',
  email: m.email ?? '',
  role: m.role ?? '',
  joined_at: toISOString(m.joinedAt),
});

export const mapBackup = (b: RawBackup) => ({
  id: b.id ?? '',
  status: b.status ?? '',
  started_at: b.startedAt ?? '',
  finished_at: b.finishedAt ?? '',
  size_bytes: b.sizeInBytes ?? 0,
  duration_seconds: b.durationInSeconds ?? 0,
  type: b.type ?? '',
});

export const mapMetricDataPoint = (p: [number, number]) => ({
  timestamp: p[0] ?? 0,
  value: p[1] ?? 0,
});

export const mapStatusSummary = (s: RawStatusPage) => ({
  status: s.status?.indicator ?? '',
  active_incidents: s.ongoing_incidents?.length ?? 0,
  active_maintenances: s.in_progress_maintenances?.length ?? 0,
});
