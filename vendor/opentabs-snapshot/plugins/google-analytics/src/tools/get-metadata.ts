import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { dataApi } from '../ga-api.js';
import {
  dimensionMetadataSchema,
  metricMetadataSchema,
  mapDimensionMetadata,
  mapMetricMetadata,
  type RawDimensionMetadata,
  type RawMetricMetadata,
} from './schemas.js';

interface MetadataResponse {
  dimensions?: RawDimensionMetadata[];
  metrics?: RawMetricMetadata[];
}

export const getMetadata = defineTool({
  name: 'get_metadata',
  displayName: 'Get Metadata',
  description:
    'List all available dimensions and metrics for a GA4 property. Use this to discover which fields can be used in run_report. Optionally filter by category to narrow results. Use property_id "0" for universal metadata (not property-specific).',
  summary: 'List available dimensions and metrics',
  icon: 'database',
  group: 'Reporting',
  input: z.object({
    property_id: z.string().describe('GA4 property ID (numeric string). Use "0" for universal metadata.'),
    category: z
      .string()
      .optional()
      .describe(
        'Filter by category (e.g., "User", "Session", "Traffic source", "Event", "Ecommerce"). Case-sensitive.',
      ),
  }),
  output: z.object({
    dimensions: z.array(dimensionMetadataSchema).describe('Available dimensions'),
    metrics: z.array(metricMetadataSchema).describe('Available metrics'),
    dimension_count: z.number().describe('Total number of dimensions returned'),
    metric_count: z.number().describe('Total number of metrics returned'),
  }),
  handle: async params => {
    const data = await dataApi<MetadataResponse>(`/properties/${params.property_id}/metadata`);

    let dimensions = (data.dimensions ?? []).map(mapDimensionMetadata);
    let metrics = (data.metrics ?? []).map(mapMetricMetadata);

    if (params.category) {
      dimensions = dimensions.filter(d => d.category === params.category);
      metrics = metrics.filter(m => m.category === params.category);
    }

    return {
      dimensions,
      metrics,
      dimension_count: dimensions.length,
      metric_count: metrics.length,
    };
  },
});
