import { z } from 'zod';

// --- Tenant ---

export const tenantSchema = z.object({
  tenant_id: z.string().describe('Tenant ID (GUID)'),
  display_name: z.string().describe('Tenant display name'),
  default_domain: z.string().describe('Default domain name'),
  tenant_category: z.string().describe('Tenant category (Home, ProjectedBy, etc.)'),
  country: z.string().describe('Country code'),
});

export interface RawTenant {
  tenantId?: string;
  displayName?: string;
  defaultDomain?: string;
  tenantCategory?: string;
  country?: string;
}

export const mapTenant = (t: RawTenant) => ({
  tenant_id: t.tenantId ?? '',
  display_name: t.displayName ?? '',
  default_domain: t.defaultDomain ?? '',
  tenant_category: t.tenantCategory ?? '',
  country: t.country ?? '',
});

// --- Subscription ---

export const subscriptionSchema = z.object({
  subscription_id: z.string().describe('Subscription ID (GUID)'),
  display_name: z.string().describe('Subscription display name'),
  state: z.string().describe('Subscription state (Enabled, Disabled, Warned, PastDue, Deleted)'),
  tenant_id: z.string().describe('Associated tenant ID'),
  subscription_policies: z
    .object({
      location_placement_id: z.string().describe('Location placement ID'),
      quota_id: z.string().describe('Quota ID'),
      spending_limit: z.string().describe('Spending limit (On, Off, CurrentPeriodOff)'),
    })
    .describe('Subscription policies'),
});

interface RawSubPolicies {
  locationPlacementId?: string;
  quotaId?: string;
  spendingLimit?: string;
}

export interface RawSubscription {
  subscriptionId?: string;
  displayName?: string;
  state?: string;
  tenantId?: string;
  subscriptionPolicies?: RawSubPolicies;
}

export const mapSubscription = (s: RawSubscription) => ({
  subscription_id: s.subscriptionId ?? '',
  display_name: s.displayName ?? '',
  state: s.state ?? '',
  tenant_id: s.tenantId ?? '',
  subscription_policies: {
    location_placement_id: s.subscriptionPolicies?.locationPlacementId ?? '',
    quota_id: s.subscriptionPolicies?.quotaId ?? '',
    spending_limit: s.subscriptionPolicies?.spendingLimit ?? '',
  },
});

// --- Resource Group ---

export const resourceGroupSchema = z.object({
  id: z.string().describe('Full resource group ID'),
  name: z.string().describe('Resource group name'),
  location: z.string().describe('Azure region (e.g., eastus, westeurope)'),
  provisioning_state: z.string().describe('Provisioning state (Succeeded, Failed, etc.)'),
  tags: z.record(z.string(), z.string()).describe('Resource group tags'),
});

export interface RawResourceGroup {
  id?: string;
  name?: string;
  location?: string;
  properties?: { provisioningState?: string };
  tags?: Record<string, string>;
}

export const mapResourceGroup = (rg: RawResourceGroup) => ({
  id: rg.id ?? '',
  name: rg.name ?? '',
  location: rg.location ?? '',
  provisioning_state: rg.properties?.provisioningState ?? '',
  tags: rg.tags ?? {},
});

// --- Resource ---

export const resourceSchema = z.object({
  id: z.string().describe('Full resource ID'),
  name: z.string().describe('Resource name'),
  type: z.string().describe('Resource type (e.g., Microsoft.Compute/virtualMachines)'),
  location: z.string().describe('Azure region'),
  kind: z.string().describe('Resource kind (varies by type)'),
  provisioning_state: z.string().describe('Provisioning state'),
  tags: z.record(z.string(), z.string()).describe('Resource tags'),
});

export interface RawResource {
  id?: string;
  name?: string;
  type?: string;
  location?: string;
  kind?: string;
  properties?: { provisioningState?: string };
  tags?: Record<string, string>;
}

export const mapResource = (r: RawResource) => ({
  id: r.id ?? '',
  name: r.name ?? '',
  type: r.type ?? '',
  location: r.location ?? '',
  kind: r.kind ?? '',
  provisioning_state: r.properties?.provisioningState ?? '',
  tags: r.tags ?? {},
});

// --- Deployment ---

export const deploymentSchema = z.object({
  id: z.string().describe('Full deployment ID'),
  name: z.string().describe('Deployment name'),
  provisioning_state: z.string().describe('Provisioning state (Succeeded, Failed, Running, etc.)'),
  timestamp: z.string().describe('Deployment timestamp (ISO 8601)'),
  duration: z.string().describe('Deployment duration'),
  mode: z.string().describe('Deployment mode (Incremental or Complete)'),
  correlation_id: z.string().describe('Correlation ID for tracking'),
});

export interface RawDeployment {
  id?: string;
  name?: string;
  properties?: {
    provisioningState?: string;
    timestamp?: string;
    duration?: string;
    mode?: string;
    correlationId?: string;
  };
}

export const mapDeployment = (d: RawDeployment) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  provisioning_state: d.properties?.provisioningState ?? '',
  timestamp: d.properties?.timestamp ?? '',
  duration: d.properties?.duration ?? '',
  mode: d.properties?.mode ?? '',
  correlation_id: d.properties?.correlationId ?? '',
});

// --- Activity Log Event ---

export const activityLogSchema = z.object({
  event_timestamp: z.string().describe('Event timestamp (ISO 8601)'),
  operation_name: z.string().describe('Operation name (e.g., Microsoft.Resources/subscriptions/write)'),
  status: z.string().describe('Event status (Succeeded, Failed, Started, etc.)'),
  caller: z.string().describe('Caller identity (email or service principal)'),
  resource_id: z.string().describe('Resource ID the event applies to'),
  resource_type: z.string().describe('Resource type'),
  level: z.string().describe('Event level (Informational, Warning, Error, Critical)'),
  description: z.string().describe('Event description'),
});

export interface RawActivityLog {
  eventTimestamp?: string;
  operationName?: { value?: string; localizedValue?: string };
  status?: { value?: string };
  caller?: string;
  resourceId?: string;
  resourceType?: { value?: string };
  level?: string;
  description?: string;
}

export const mapActivityLog = (e: RawActivityLog) => ({
  event_timestamp: e.eventTimestamp ?? '',
  operation_name: e.operationName?.value ?? '',
  status: e.status?.value ?? '',
  caller: e.caller ?? '',
  resource_id: e.resourceId ?? '',
  resource_type: e.resourceType?.value ?? '',
  level: e.level ?? '',
  description: e.description ?? '',
});

// --- Location ---

export const locationSchema = z.object({
  name: z.string().describe('Location short name (e.g., eastus)'),
  display_name: z.string().describe('Display name (e.g., East US)'),
  regional_display_name: z.string().describe('Regional display name (e.g., (US) East US)'),
  geography: z.string().describe('Geography (e.g., United States)'),
  geography_group: z.string().describe('Geography group (e.g., US)'),
  region_type: z.string().describe('Region type (Physical, Logical)'),
  region_category: z.string().describe('Region category (Recommended, Other)'),
  physical_location: z.string().describe('Physical location (e.g., Virginia)'),
});

export interface RawLocation {
  name?: string;
  displayName?: string;
  regionalDisplayName?: string;
  metadata?: {
    geography?: string;
    geographyGroup?: string;
    regionType?: string;
    regionCategory?: string;
    physicalLocation?: string;
  };
}

export const mapLocation = (l: RawLocation) => ({
  name: l.name ?? '',
  display_name: l.displayName ?? '',
  regional_display_name: l.regionalDisplayName ?? '',
  geography: l.metadata?.geography ?? '',
  geography_group: l.metadata?.geographyGroup ?? '',
  region_type: l.metadata?.regionType ?? '',
  region_category: l.metadata?.regionCategory ?? '',
  physical_location: l.metadata?.physicalLocation ?? '',
});

// --- Tag ---

export const tagSchema = z.object({
  tag_name: z.string().describe('Tag name'),
  count_type: z.string().describe('Count type'),
  count_value: z.number().describe('Number of resources with this tag'),
  values: z
    .array(
      z.object({
        tag_value: z.string().describe('Tag value'),
        count_value: z.number().describe('Number of resources with this tag value'),
      }),
    )
    .describe('Tag values'),
});

export interface RawTag {
  tagName?: string;
  count?: { type?: string; value?: number };
  values?: Array<{ tagValue?: string; count?: { type?: string; value?: number } }>;
}

export const mapTag = (t: RawTag) => ({
  tag_name: t.tagName ?? '',
  count_type: t.count?.type ?? '',
  count_value: t.count?.value ?? 0,
  values: (t.values ?? []).map(v => ({
    tag_value: v.tagValue ?? '',
    count_value: v.count?.value ?? 0,
  })),
});

// --- Management Lock ---

export const lockSchema = z.object({
  id: z.string().describe('Full lock ID'),
  name: z.string().describe('Lock name'),
  level: z.string().describe('Lock level (CanNotDelete, ReadOnly)'),
  notes: z.string().describe('Notes about the lock'),
});

export interface RawLock {
  id?: string;
  name?: string;
  properties?: { level?: string; notes?: string };
}

export const mapLock = (l: RawLock) => ({
  id: l.id ?? '',
  name: l.name ?? '',
  level: l.properties?.level ?? '',
  notes: l.properties?.notes ?? '',
});

// --- Resource Provider ---

export const providerSchema = z.object({
  namespace: z.string().describe('Provider namespace (e.g., Microsoft.Compute)'),
  registration_state: z.string().describe('Registration state (Registered, NotRegistered)'),
});

export interface RawProvider {
  namespace?: string;
  registrationState?: string;
}

export const mapProvider = (p: RawProvider) => ({
  namespace: p.namespace ?? '',
  registration_state: p.registrationState ?? '',
});

// --- Policy Assignment ---

export const policyAssignmentSchema = z.object({
  id: z.string().describe('Full policy assignment ID'),
  name: z.string().describe('Policy assignment name'),
  display_name: z.string().describe('Display name'),
  description: z.string().describe('Description'),
  policy_definition_id: z.string().describe('Policy definition ID'),
  scope: z.string().describe('Assignment scope'),
  enforcement_mode: z.string().describe('Enforcement mode (Default, DoNotEnforce)'),
});

export interface RawPolicyAssignment {
  id?: string;
  name?: string;
  properties?: {
    displayName?: string;
    description?: string;
    policyDefinitionId?: string;
    scope?: string;
    enforcementMode?: string;
  };
}

export const mapPolicyAssignment = (p: RawPolicyAssignment) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  display_name: p.properties?.displayName ?? '',
  description: p.properties?.description ?? '',
  policy_definition_id: p.properties?.policyDefinitionId ?? '',
  scope: p.properties?.scope ?? '',
  enforcement_mode: p.properties?.enforcementMode ?? '',
});

// --- Role Assignment ---

export const roleAssignmentSchema = z.object({
  id: z.string().describe('Full role assignment ID'),
  name: z.string().describe('Role assignment name (GUID)'),
  role_definition_id: z.string().describe('Role definition ID'),
  principal_id: z.string().describe('Principal ID (user, group, or service principal)'),
  principal_type: z.string().describe('Principal type (User, Group, ServicePrincipal)'),
  scope: z.string().describe('Assignment scope'),
});

export interface RawRoleAssignment {
  id?: string;
  name?: string;
  properties?: {
    roleDefinitionId?: string;
    principalId?: string;
    principalType?: string;
    scope?: string;
  };
}

export const mapRoleAssignment = (r: RawRoleAssignment) => ({
  id: r.id ?? '',
  name: r.name ?? '',
  role_definition_id: r.properties?.roleDefinitionId ?? '',
  principal_id: r.properties?.principalId ?? '',
  principal_type: r.properties?.principalType ?? '',
  scope: r.properties?.scope ?? '',
});

// --- User Profile ---

export const userProfileSchema = z.object({
  id: z.string().describe('User object ID'),
  display_name: z.string().describe('Display name'),
  user_principal_name: z.string().describe('User principal name (email-like identifier)'),
  mail: z.string().describe('Email address'),
  given_name: z.string().describe('First name'),
  surname: z.string().describe('Last name'),
  job_title: z.string().describe('Job title'),
});

// --- ARM list response envelope ---

export interface ArmListResponse<T> {
  value?: T[];
  nextLink?: string;
}
