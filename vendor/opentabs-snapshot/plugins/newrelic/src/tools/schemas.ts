import { z } from 'zod';

// --- Account & User ---

export const userSchema = z.object({
  id: z.number().describe('User ID'),
  name: z.string().describe('Display name'),
  email: z.string().describe('Email address'),
});

export interface RawUser {
  id?: number;
  name?: string;
  email?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? 0,
  name: u.name ?? '',
  email: u.email ?? '',
});

export const accountSchema = z.object({
  id: z.number().describe('Account ID'),
  name: z.string().describe('Account name'),
});

export interface RawAccount {
  id?: number;
  name?: string;
}

export const mapAccount = (a: RawAccount) => ({
  id: a.id ?? 0,
  name: a.name ?? '',
});

export const organizationSchema = z.object({
  id: z.string().describe('Organization ID (UUID)'),
  name: z.string().describe('Organization name'),
});

export interface RawOrganization {
  id?: string;
  name?: string;
}

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? '',
  name: o.name ?? '',
});

// --- Entity ---

export const tagSchema = z.object({
  key: z.string().describe('Tag key'),
  values: z.array(z.string()).describe('Tag values'),
});

export interface RawTag {
  key?: string;
  values?: string[];
}

export const mapTag = (t: RawTag) => ({
  key: t.key ?? '',
  values: t.values ?? [],
});

export const entitySchema = z.object({
  guid: z.string().describe('Entity GUID (globally unique identifier)'),
  name: z.string().describe('Entity name'),
  type: z.string().describe('Entity type (e.g., APPLICATION, HOST, DASHBOARD)'),
  domain: z.string().describe('Entity domain (e.g., APM, INFRA, BROWSER, SYNTH, VIZ)'),
  entity_type: z.string().describe('Full entity type string'),
  alert_severity: z.string().describe('Alert severity or empty if none'),
  reporting: z.boolean().describe('Whether the entity is currently reporting'),
  permalink: z.string().describe('URL to the entity in New Relic'),
  tags: z.array(tagSchema).describe('Entity tags'),
});

export interface RawEntity {
  guid?: string;
  name?: string;
  type?: string;
  domain?: string;
  entityType?: string;
  alertSeverity?: string;
  reporting?: boolean;
  permalink?: string;
  tags?: RawTag[];
}

export const mapEntity = (e: RawEntity) => ({
  guid: e.guid ?? '',
  name: e.name ?? '',
  type: e.type ?? '',
  domain: e.domain ?? '',
  entity_type: e.entityType ?? '',
  alert_severity: e.alertSeverity ?? '',
  reporting: e.reporting ?? false,
  permalink: e.permalink ?? '',
  tags: (e.tags ?? []).map(mapTag),
});

// --- Dashboard ---

export const dashboardWidgetSchema = z.object({
  id: z.string().describe('Widget ID'),
  title: z.string().describe('Widget title'),
  visualization_id: z.string().describe('Visualization type ID'),
});

export interface RawDashboardWidget {
  id?: string;
  title?: string;
  visualization?: { id?: string };
}

export const mapDashboardWidget = (w: RawDashboardWidget) => ({
  id: w.id ?? '',
  title: w.title ?? '',
  visualization_id: w.visualization?.id ?? '',
});

export const dashboardPageSchema = z.object({
  guid: z.string().describe('Page GUID'),
  name: z.string().describe('Page name'),
  widgets: z.array(dashboardWidgetSchema).describe('Widgets on this page'),
});

export interface RawDashboardPage {
  guid?: string;
  name?: string;
  widgets?: RawDashboardWidget[];
}

export const mapDashboardPage = (p: RawDashboardPage) => ({
  guid: p.guid ?? '',
  name: p.name ?? '',
  widgets: (p.widgets ?? []).map(mapDashboardWidget),
});

export const dashboardSchema = z.object({
  guid: z.string().describe('Dashboard GUID'),
  name: z.string().describe('Dashboard name'),
  description: z.string().describe('Dashboard description'),
  permissions: z.string().describe('Permission level: PUBLIC_READ_WRITE, PUBLIC_READ_ONLY, PRIVATE'),
  owner_email: z.string().describe('Email of the dashboard owner'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last updated timestamp'),
  pages: z.array(dashboardPageSchema).describe('Dashboard pages'),
});

export interface RawDashboard {
  guid?: string;
  name?: string;
  description?: string;
  permissions?: string;
  owner?: { email?: string };
  createdAt?: string;
  updatedAt?: string;
  pages?: RawDashboardPage[];
}

export const mapDashboard = (d: RawDashboard) => ({
  guid: d.guid ?? '',
  name: d.name ?? '',
  description: d.description ?? '',
  permissions: d.permissions ?? '',
  owner_email: d.owner?.email ?? '',
  created_at: d.createdAt ?? '',
  updated_at: d.updatedAt ?? '',
  pages: (d.pages ?? []).map(mapDashboardPage),
});

// --- Alert Policy ---

export const alertPolicySchema = z.object({
  id: z.string().describe('Alert policy ID'),
  name: z.string().describe('Alert policy name'),
  incident_preference: z
    .string()
    .describe('Incident preference: PER_POLICY, PER_CONDITION, or PER_CONDITION_AND_TARGET'),
});

export interface RawAlertPolicy {
  id?: string;
  name?: string;
  incidentPreference?: string;
}

export const mapAlertPolicy = (p: RawAlertPolicy) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  incident_preference: p.incidentPreference ?? '',
});

// --- Dashboard Input (shared between create and update) ---

export const widgetInputSchema = z.object({
  title: z.string().describe('Widget title'),
  nrql_query: z
    .string()
    .optional()
    .describe('NRQL query for data-driven widgets (e.g., "SELECT count(*) FROM Transaction SINCE 1 hour ago")'),
  markdown: z.string().optional().describe('Markdown text for markdown widgets'),
  visualization: z
    .enum(['viz.billboard', 'viz.line', 'viz.table', 'viz.bar', 'viz.pie', 'viz.area', 'viz.markdown'])
    .optional()
    .describe('Visualization type (default viz.line for NRQL, viz.markdown for markdown)'),
  row: z.number().int().optional().describe('Row position (default 1)'),
  column: z.number().int().optional().describe('Column position (default 1)'),
  width: z.number().int().optional().describe('Width in columns 1-12 (default 4)'),
  height: z.number().int().optional().describe('Height in rows (default 3)'),
});

export const pageInputSchema = z.object({
  name: z.string().describe('Page name'),
  widgets: z.array(widgetInputSchema).min(1).describe('Widgets for this page'),
});

export type WidgetInput = z.infer<typeof widgetInputSchema>;

/** Map a widget input to the NerdGraph DashboardWidgetInput shape */
export const mapWidgetToInput = (w: WidgetInput, accountId: number) => {
  const layout = {
    row: w.row ?? 1,
    column: w.column ?? 1,
    width: w.width ?? 4,
    height: w.height ?? 3,
  };

  if (w.markdown !== undefined) {
    return {
      title: w.title,
      configuration: { markdown: { text: w.markdown } },
      rawConfiguration: { text: w.markdown },
      layout,
    };
  }

  return {
    title: w.title,
    visualization: {
      id: w.visualization ?? 'viz.line',
    },
    rawConfiguration: {
      nrqlQueries: [{ accountId, query: w.nrql_query ?? '' }],
    },
    layout,
  };
};

// --- NRQL Condition ---

export const nrqlConditionSchema = z.object({
  id: z.string().describe('Condition ID'),
  name: z.string().describe('Condition name'),
  enabled: z.boolean().describe('Whether the condition is enabled'),
  nrql_query: z.string().describe('NRQL query for the condition'),
  policy_id: z.string().describe('Parent alert policy ID'),
  signal_aggregation_window: z.number().describe('Aggregation window in seconds'),
});

export interface RawNrqlCondition {
  id?: string;
  name?: string;
  enabled?: boolean;
  nrql?: { query?: string };
  policyId?: string;
  signal?: { aggregationWindow?: number };
}

export const mapNrqlCondition = (c: RawNrqlCondition) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  enabled: c.enabled ?? false,
  nrql_query: c.nrql?.query ?? '',
  policy_id: c.policyId ?? '',
  signal_aggregation_window: c.signal?.aggregationWindow ?? 0,
});
