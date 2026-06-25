import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type BelowTheFoldPayload, riskFactorSchema, mapRiskFactor } from './schemas.js';

export const getPropertyRiskFactors = defineTool({
  name: 'get_property_risk_factors',
  displayName: 'Get Property Risk Factors',
  description:
    'Get environmental and climate risk data for a property, including flood, fire, heat, wind, and air quality risk scores and descriptions.',
  summary: 'Get climate and environmental risk data',
  icon: 'shield-alert',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    risk_factors: z.array(riskFactorSchema).describe('Risk factors for the property'),
  }),
  handle: async params => {
    const data = await api<BelowTheFoldPayload>('/stingray/api/home/details/belowTheFold', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    const rf = data.riskFactorData;
    const factors = [
      mapRiskFactor('flood', rf?.floodData as Parameters<typeof mapRiskFactor>[1]),
      mapRiskFactor('fire', rf?.fireData as Parameters<typeof mapRiskFactor>[1]),
      mapRiskFactor('heat', rf?.heatData as Parameters<typeof mapRiskFactor>[1]),
      mapRiskFactor('wind', rf?.windData as Parameters<typeof mapRiskFactor>[1]),
      mapRiskFactor('air', rf?.airData as Parameters<typeof mapRiskFactor>[1]),
    ];

    return { risk_factors: factors };
  },
});
