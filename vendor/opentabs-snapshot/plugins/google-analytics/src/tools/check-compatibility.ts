import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { dataApi } from '../ga-api.js';
import {
  compatibilityResultSchema,
  mapDimensionCompatibility,
  mapMetricCompatibility,
  type RawCompatibilityResult,
} from './schemas.js';

interface CheckCompatibilityResponse {
  dimensionCompatibilities?: RawCompatibilityResult[];
  metricCompatibilities?: RawCompatibilityResult[];
}

export const checkCompatibility = defineTool({
  name: 'check_compatibility',
  displayName: 'Check Compatibility',
  description:
    'Check which dimensions and metrics are compatible with each other for a given GA4 property. Not all dimension-metric combinations work together in a report. Use this before run_report to validate your query will succeed. Returns all available dimensions and metrics with a "compatible" flag indicating whether they can be used together in the same report.',
  summary: 'Check dimension/metric compatibility',
  icon: 'check-circle',
  group: 'Reporting',
  input: z.object({
    property_id: z.string().describe('GA4 property ID (numeric string)'),
    dimensions: z
      .array(z.string())
      .optional()
      .describe('Dimensions already selected (checks what metrics are compatible with these)'),
    metrics: z
      .array(z.string())
      .optional()
      .describe('Metrics already selected (checks what dimensions are compatible with these)'),
  }),
  output: z.object({
    compatible_dimensions: z.array(compatibilityResultSchema).describe('Dimensions and their compatibility status'),
    compatible_metrics: z.array(compatibilityResultSchema).describe('Metrics and their compatibility status'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};

    if (params.dimensions?.length) {
      body.dimensions = params.dimensions.map(name => ({ name }));
    }
    if (params.metrics?.length) {
      body.metrics = params.metrics.map(name => ({ name }));
    }

    const data = await dataApi<CheckCompatibilityResponse>(
      `/properties/${params.property_id}:checkCompatibility`,
      body,
    );

    return {
      compatible_dimensions: (data.dimensionCompatibilities ?? []).map(mapDimensionCompatibility),
      compatible_metrics: (data.metricCompatibilities ?? []).map(mapMetricCompatibility),
    };
  },
});
