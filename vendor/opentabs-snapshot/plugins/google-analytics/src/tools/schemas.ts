import { z } from 'zod';

// --- Account / Property schemas ---

export const accountSchema = z.object({
  id: z.string().describe('GA account ID (numeric string)'),
  name: z.string().describe('Account display name'),
  entity_id: z.string().describe('Internal entity ID'),
  status: z.string().describe('Account status (e.g., ACTIVE)'),
});

export interface RawEntityHeader {
  type?: string;
  id?: string;
  name?: string;
  accountMeta?: { accountStatus?: string };
  propertyMeta?: { propertyId?: string; serviceLevel?: string };
  entityId?: string;
  parentId?: string;
  starred?: boolean;
}

export const mapAccount = (h: RawEntityHeader) => ({
  id: h.id ?? '',
  name: h.name ?? '',
  entity_id: h.entityId ?? '',
  status: h.accountMeta?.accountStatus ?? '',
});

export const propertySchema = z.object({
  id: z.string().describe('GA account-level property ID'),
  name: z.string().describe('Property display name'),
  property_id: z.string().describe('GA4 property ID (numeric, used in API calls)'),
  account_id: z.string().describe('Parent account ID'),
  service_level: z.string().describe('Service level (e.g., STANDARD, PREMIUM)'),
});

export const mapProperty = (h: RawEntityHeader) => ({
  id: h.id ?? '',
  name: h.name ?? '',
  property_id: h.propertyMeta?.propertyId ?? '',
  account_id: h.parentId ?? '',
  service_level: h.propertyMeta?.serviceLevel ?? '',
});

// --- Metadata schemas ---

export const dimensionMetadataSchema = z.object({
  api_name: z.string().describe('API field name (e.g., "country", "sessionSource")'),
  ui_name: z.string().describe('Human-readable name shown in GA4 UI'),
  description: z.string().describe('What this dimension represents'),
  category: z.string().describe('Grouping category (e.g., "User", "Traffic source", "Event")'),
});

export interface RawDimensionMetadata {
  apiName?: string;
  uiName?: string;
  description?: string;
  category?: string;
}

export const mapDimensionMetadata = (d: RawDimensionMetadata) => ({
  api_name: d.apiName ?? '',
  ui_name: d.uiName ?? '',
  description: d.description ?? '',
  category: d.category ?? '',
});

export const metricMetadataSchema = z.object({
  api_name: z.string().describe('API field name (e.g., "activeUsers", "sessions")'),
  ui_name: z.string().describe('Human-readable name shown in GA4 UI'),
  description: z.string().describe('What this metric measures'),
  category: z.string().describe('Grouping category (e.g., "User", "Session", "Event")'),
  type: z.string().describe('Data type (e.g., TYPE_INTEGER, TYPE_FLOAT, TYPE_CURRENCY)'),
});

export interface RawMetricMetadata {
  apiName?: string;
  uiName?: string;
  description?: string;
  category?: string;
  type?: string;
}

export const mapMetricMetadata = (m: RawMetricMetadata) => ({
  api_name: m.apiName ?? '',
  ui_name: m.uiName ?? '',
  description: m.description ?? '',
  category: m.category ?? '',
  type: m.type ?? '',
});

// --- Report schemas ---

export const reportRowSchema = z.object({
  dimensions: z.array(z.string()).describe('Dimension values for this row'),
  metrics: z.array(z.string()).describe('Metric values for this row'),
});

interface RawDimensionValue {
  value?: string;
}

interface RawMetricValue {
  value?: string;
}

export interface RawReportRow {
  dimensionValues?: RawDimensionValue[];
  metricValues?: RawMetricValue[];
}

export const mapReportRow = (r: RawReportRow) => ({
  dimensions: (r.dimensionValues ?? []).map(d => d.value ?? ''),
  metrics: (r.metricValues ?? []).map(m => m.value ?? ''),
});

export interface RawReportHeader {
  name?: string;
}

export const reportHeaderSchema = z.object({
  name: z.string().describe('Dimension or metric API name'),
});

export const mapReportHeader = (h: RawReportHeader) => ({
  name: h.name ?? '',
});

// --- Compatibility schemas ---

export const compatibilityResultSchema = z.object({
  compatible: z.boolean().describe('Whether the dimension/metric is compatible with the query'),
  api_name: z.string().describe('API field name'),
});

export interface RawCompatibilityResult {
  compatibility?: string;
  dimensionMetadata?: { apiName?: string };
  metricMetadata?: { apiName?: string };
}

export const mapDimensionCompatibility = (c: RawCompatibilityResult) => ({
  compatible: c.compatibility === 'COMPATIBLE',
  api_name: c.dimensionMetadata?.apiName ?? '',
});

export const mapMetricCompatibility = (c: RawCompatibilityResult) => ({
  compatible: c.compatibility === 'COMPATIBLE',
  api_name: c.metricMetadata?.apiName ?? '',
});
