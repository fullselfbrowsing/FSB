import { z } from 'zod';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectSchema = z.object({
  project_id: z.string().describe('Project ID (e.g., "my-project")'),
  project_number: z.string().describe('Numeric project number'),
  name: z.string().describe('Project display name'),
  state: z.string().describe('Lifecycle state (e.g., ACTIVE, DELETE_REQUESTED)'),
  create_time: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawProjectV1 {
  projectId?: string;
  projectNumber?: string;
  name?: string;
  lifecycleState?: string;
  createTime?: string;
}

export const mapProjectV1 = (p: RawProjectV1) => ({
  project_id: p.projectId ?? '',
  project_number: p.projectNumber ?? '',
  name: p.name ?? '',
  state: p.lifecycleState ?? '',
  create_time: p.createTime ?? '',
});

export interface RawProjectV3 {
  name?: string;
  projectId?: string;
  displayName?: string;
  state?: string;
  createTime?: string;
}

export const mapProjectV3 = (p: RawProjectV3) => ({
  project_id: p.projectId ?? '',
  project_number: p.name?.replace('projects/', '') ?? '',
  name: p.displayName ?? '',
  state: p.state ?? '',
  create_time: p.createTime ?? '',
});

// ---------------------------------------------------------------------------
// Compute — Instances
// ---------------------------------------------------------------------------

export const instanceSchema = z.object({
  id: z.string().describe('Instance numeric ID'),
  name: z.string().describe('Instance name'),
  zone: z.string().describe('Zone (e.g., "us-central1-a")'),
  machine_type: z.string().describe('Machine type (e.g., "e2-medium")'),
  status: z.string().describe('Instance status (e.g., RUNNING, TERMINATED, STOPPED)'),
  internal_ip: z.string().describe('Primary internal IP address'),
  external_ip: z.string().describe('Primary external IP address (empty if none)'),
  creation_timestamp: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawInstance {
  id?: string;
  name?: string;
  zone?: string;
  machineType?: string;
  status?: string;
  networkInterfaces?: Array<{
    networkIP?: string;
    accessConfigs?: Array<{ natIP?: string }>;
  }>;
  creationTimestamp?: string;
}

const shortZone = (z?: string) => z?.split('/').pop() ?? '';
const shortMachineType = (m?: string) => m?.split('/').pop() ?? '';

export const mapInstance = (i: RawInstance) => ({
  id: i.id ?? '',
  name: i.name ?? '',
  zone: shortZone(i.zone),
  machine_type: shortMachineType(i.machineType),
  status: i.status ?? '',
  internal_ip: i.networkInterfaces?.[0]?.networkIP ?? '',
  external_ip: i.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? '',
  creation_timestamp: i.creationTimestamp ?? '',
});

// ---------------------------------------------------------------------------
// Compute — Disks
// ---------------------------------------------------------------------------

export const diskSchema = z.object({
  id: z.string().describe('Disk numeric ID'),
  name: z.string().describe('Disk name'),
  zone: z.string().describe('Zone'),
  size_gb: z.string().describe('Disk size in GB'),
  type: z.string().describe('Disk type (e.g., pd-standard, pd-ssd)'),
  status: z.string().describe('Disk status (e.g., READY)'),
  creation_timestamp: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawDisk {
  id?: string;
  name?: string;
  zone?: string;
  sizeGb?: string;
  type?: string;
  status?: string;
  creationTimestamp?: string;
}

export const mapDisk = (d: RawDisk) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  zone: shortZone(d.zone),
  size_gb: d.sizeGb ?? '',
  type: d.type?.split('/').pop() ?? '',
  status: d.status ?? '',
  creation_timestamp: d.creationTimestamp ?? '',
});

// ---------------------------------------------------------------------------
// Compute — Networks
// ---------------------------------------------------------------------------

export const networkSchema = z.object({
  id: z.string().describe('Network numeric ID'),
  name: z.string().describe('Network name'),
  auto_create_subnetworks: z.boolean().describe('Whether subnets are auto-created'),
  routing_mode: z.string().describe('Routing mode (REGIONAL or GLOBAL)'),
  creation_timestamp: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawNetwork {
  id?: string;
  name?: string;
  autoCreateSubnetworks?: boolean;
  routingConfig?: { routingMode?: string };
  creationTimestamp?: string;
}

export const mapNetwork = (n: RawNetwork) => ({
  id: n.id ?? '',
  name: n.name ?? '',
  auto_create_subnetworks: n.autoCreateSubnetworks ?? false,
  routing_mode: n.routingConfig?.routingMode ?? '',
  creation_timestamp: n.creationTimestamp ?? '',
});

// ---------------------------------------------------------------------------
// Compute — Firewalls
// ---------------------------------------------------------------------------

export const firewallSchema = z.object({
  id: z.string().describe('Firewall numeric ID'),
  name: z.string().describe('Firewall rule name'),
  network: z.string().describe('Network name the rule applies to'),
  direction: z.string().describe('Direction (INGRESS or EGRESS)'),
  priority: z.number().describe('Rule priority (0-65535, lower = higher priority)'),
  disabled: z.boolean().describe('Whether the rule is disabled'),
  creation_timestamp: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawFirewall {
  id?: string;
  name?: string;
  network?: string;
  direction?: string;
  priority?: number;
  disabled?: boolean;
  creationTimestamp?: string;
}

export const mapFirewall = (f: RawFirewall) => ({
  id: f.id ?? '',
  name: f.name ?? '',
  network: f.network?.split('/').pop() ?? '',
  direction: f.direction ?? '',
  priority: f.priority ?? 0,
  disabled: f.disabled ?? false,
  creation_timestamp: f.creationTimestamp ?? '',
});

// ---------------------------------------------------------------------------
// Storage — Buckets
// ---------------------------------------------------------------------------

export const bucketSchema = z.object({
  name: z.string().describe('Bucket name'),
  location: z.string().describe('Location (e.g., US, US-CENTRAL1)'),
  storage_class: z.string().describe('Default storage class (e.g., STANDARD, NEARLINE)'),
  creation_time: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawBucket {
  name?: string;
  location?: string;
  storageClass?: string;
  timeCreated?: string;
}

export const mapBucket = (b: RawBucket) => ({
  name: b.name ?? '',
  location: b.location ?? '',
  storage_class: b.storageClass ?? '',
  creation_time: b.timeCreated ?? '',
});

// ---------------------------------------------------------------------------
// Storage — Objects
// ---------------------------------------------------------------------------

export const objectSchema = z.object({
  name: z.string().describe('Object name (key/path)'),
  size: z.string().describe('Object size in bytes'),
  content_type: z.string().describe('MIME content type'),
  updated: z.string().describe('ISO 8601 last-modified timestamp'),
});

export interface RawObject {
  name?: string;
  size?: string;
  contentType?: string;
  updated?: string;
}

export const mapObject = (o: RawObject) => ({
  name: o.name ?? '',
  size: o.size ?? '0',
  content_type: o.contentType ?? '',
  updated: o.updated ?? '',
});

// ---------------------------------------------------------------------------
// IAM — Service Accounts
// ---------------------------------------------------------------------------

export const serviceAccountSchema = z.object({
  email: z.string().describe('Service account email'),
  name: z.string().describe('Resource name'),
  display_name: z.string().describe('Display name'),
  disabled: z.boolean().describe('Whether the service account is disabled'),
});

export interface RawServiceAccount {
  email?: string;
  name?: string;
  displayName?: string;
  disabled?: boolean;
}

export const mapServiceAccount = (sa: RawServiceAccount) => ({
  email: sa.email ?? '',
  name: sa.name ?? '',
  display_name: sa.displayName ?? '',
  disabled: sa.disabled ?? false,
});

// ---------------------------------------------------------------------------
// IAM — Roles
// ---------------------------------------------------------------------------

export const roleSchema = z.object({
  name: z.string().describe('Role resource name'),
  title: z.string().describe('Role title'),
  description: z.string().describe('Role description'),
  stage: z.string().describe('Launch stage (e.g., GA, BETA)'),
});

export interface RawRole {
  name?: string;
  title?: string;
  description?: string;
  stage?: string;
}

export const mapRole = (r: RawRole) => ({
  name: r.name ?? '',
  title: r.title ?? '',
  description: r.description ?? '',
  stage: r.stage ?? '',
});

// ---------------------------------------------------------------------------
// IAM — Policy Binding
// ---------------------------------------------------------------------------

export const bindingSchema = z.object({
  role: z.string().describe('IAM role'),
  members: z.array(z.string()).describe('List of member identities'),
});

export interface RawBinding {
  role?: string;
  members?: string[];
}

export const mapBinding = (b: RawBinding) => ({
  role: b.role ?? '',
  members: b.members ?? [],
});

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const serviceSchema = z.object({
  name: z.string().describe('Service resource name'),
  service_name: z.string().describe('Service API name (e.g., compute.googleapis.com)'),
  title: z.string().describe('Service display title'),
  state: z.string().describe('State (ENABLED or DISABLED)'),
});

export interface RawService {
  name?: string;
  config?: { name?: string; title?: string };
  state?: string;
}

export const mapService = (s: RawService) => ({
  name: s.name ?? '',
  service_name: s.config?.name ?? '',
  title: s.config?.title ?? '',
  state: s.state ?? '',
});

// ---------------------------------------------------------------------------
// Cloud Functions
// ---------------------------------------------------------------------------

export const cloudFunctionSchema = z.object({
  name: z.string().describe('Function resource name'),
  state: z.string().describe('State (e.g., ACTIVE, DEPLOYING)'),
  environment: z.string().describe('Environment (GEN_1 or GEN_2)'),
  runtime: z.string().describe('Runtime (e.g., nodejs20, python312)'),
  entry_point: z.string().describe('Function entry point'),
  url: z.string().describe('HTTPS trigger URL (empty if not HTTP-triggered)'),
  update_time: z.string().describe('ISO 8601 last-update timestamp'),
});

export interface RawCloudFunction {
  name?: string;
  state?: string;
  environment?: string;
  buildConfig?: { runtime?: string; entryPoint?: string };
  serviceConfig?: { uri?: string };
  updateTime?: string;
}

export const mapCloudFunction = (f: RawCloudFunction) => ({
  name: f.name ?? '',
  state: f.state ?? '',
  environment: f.environment ?? '',
  runtime: f.buildConfig?.runtime ?? '',
  entry_point: f.buildConfig?.entryPoint ?? '',
  url: f.serviceConfig?.uri ?? '',
  update_time: f.updateTime ?? '',
});

// ---------------------------------------------------------------------------
// Cloud Run — Services
// ---------------------------------------------------------------------------

export const cloudRunServiceSchema = z.object({
  name: z.string().describe('Service resource name'),
  uri: z.string().describe('Service URL'),
  creator: z.string().describe('Creator email'),
  last_modifier: z.string().describe('Last modifier email'),
  ingress: z.string().describe('Ingress setting (e.g., INGRESS_TRAFFIC_ALL)'),
  launch_stage: z.string().describe('Launch stage (e.g., GA, BETA)'),
  create_time: z.string().describe('ISO 8601 creation timestamp'),
  update_time: z.string().describe('ISO 8601 last-update timestamp'),
});

export interface RawCloudRunService {
  name?: string;
  uri?: string;
  creator?: string;
  lastModifier?: string;
  ingress?: string;
  launchStage?: string;
  createTime?: string;
  updateTime?: string;
}

export const mapCloudRunService = (s: RawCloudRunService) => ({
  name: s.name ?? '',
  uri: s.uri ?? '',
  creator: s.creator ?? '',
  last_modifier: s.lastModifier ?? '',
  ingress: s.ingress ?? '',
  launch_stage: s.launchStage ?? '',
  create_time: s.createTime ?? '',
  update_time: s.updateTime ?? '',
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export const logEntrySchema = z.object({
  log_name: z.string().describe('Log resource name'),
  severity: z.string().describe('Severity (e.g., INFO, WARNING, ERROR)'),
  timestamp: z.string().describe('ISO 8601 timestamp'),
  text: z.string().describe('Log message text'),
  resource_type: z.string().describe('Monitored resource type'),
});

export interface RawLogEntry {
  logName?: string;
  severity?: string;
  timestamp?: string;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  protoPayload?: Record<string, unknown>;
  resource?: { type?: string };
}

export const mapLogEntry = (e: RawLogEntry) => {
  let text = e.textPayload ?? '';
  if (!text && e.jsonPayload) text = JSON.stringify(e.jsonPayload);
  if (!text && e.protoPayload) text = JSON.stringify(e.protoPayload);
  return {
    log_name: e.logName ?? '',
    severity: e.severity ?? 'DEFAULT',
    timestamp: e.timestamp ?? '',
    text,
    resource_type: e.resource?.type ?? '',
  };
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const billingAccountSchema = z.object({
  name: z.string().describe('Billing account resource name'),
  display_name: z.string().describe('Display name'),
  open: z.boolean().describe('Whether the account is open'),
});

export interface RawBillingAccount {
  name?: string;
  displayName?: string;
  open?: boolean;
}

export const mapBillingAccount = (b: RawBillingAccount) => ({
  name: b.name ?? '',
  display_name: b.displayName ?? '',
  open: b.open ?? false,
});

export const billingInfoSchema = z.object({
  project_id: z.string().describe('Project ID'),
  billing_account_name: z.string().describe('Associated billing account resource name'),
  billing_enabled: z.boolean().describe('Whether billing is enabled'),
});

export interface RawBillingInfo {
  projectId?: string;
  billingAccountName?: string;
  billingEnabled?: boolean;
}

export const mapBillingInfo = (b: RawBillingInfo) => ({
  project_id: b.projectId ?? '',
  billing_account_name: b.billingAccountName ?? '',
  billing_enabled: b.billingEnabled ?? false,
});

// ---------------------------------------------------------------------------
// Kubernetes (GKE)
// ---------------------------------------------------------------------------

export const clusterSchema = z.object({
  name: z.string().describe('Cluster name'),
  location: z.string().describe('Cluster location (zone or region)'),
  status: z.string().describe('Cluster status (e.g., RUNNING, PROVISIONING)'),
  node_count: z.number().describe('Total node count'),
  cluster_version: z.string().describe('Kubernetes master version'),
  endpoint: z.string().describe('Cluster API server endpoint'),
  create_time: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawCluster {
  name?: string;
  location?: string;
  status?: string;
  currentNodeCount?: number;
  currentMasterVersion?: string;
  endpoint?: string;
  createTime?: string;
}

export const mapCluster = (c: RawCluster) => ({
  name: c.name ?? '',
  location: c.location ?? '',
  status: c.status ?? '',
  node_count: c.currentNodeCount ?? 0,
  cluster_version: c.currentMasterVersion ?? '',
  endpoint: c.endpoint ?? '',
  create_time: c.createTime ?? '',
});

// ---------------------------------------------------------------------------
// Cloud SQL
// ---------------------------------------------------------------------------

export const sqlInstanceSchema = z.object({
  name: z.string().describe('Instance name'),
  database_version: z.string().describe('Database version (e.g., POSTGRES_15, MYSQL_8_0)'),
  state: z.string().describe('Instance state (e.g., RUNNABLE, SUSPENDED)'),
  region: z.string().describe('Region (e.g., us-central1)'),
  tier: z.string().describe('Machine tier (e.g., db-f1-micro)'),
  ip_address: z.string().describe('Primary IP address'),
  create_time: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawSqlInstance {
  name?: string;
  databaseVersion?: string;
  state?: string;
  region?: string;
  settings?: { tier?: string };
  ipAddresses?: Array<{ ipAddress?: string; type?: string }>;
  createTime?: string;
}

export const mapSqlInstance = (s: RawSqlInstance) => ({
  name: s.name ?? '',
  database_version: s.databaseVersion ?? '',
  state: s.state ?? '',
  region: s.region ?? '',
  tier: s.settings?.tier ?? '',
  ip_address: s.ipAddresses?.find(ip => ip.type === 'PRIMARY')?.ipAddress ?? '',
  create_time: s.createTime ?? '',
});
