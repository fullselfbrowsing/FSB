import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type BelowTheFoldPayload, schoolSchema, mapSchool } from './schemas.js';

export const getPropertySchools = defineTool({
  name: 'get_property_schools',
  displayName: 'Get Property Schools',
  description:
    'Get schools and districts that serve a property, including school ratings, grade ranges, and distance from the home.',
  summary: 'Get nearby schools and ratings',
  icon: 'graduation-cap',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    schools: z.array(schoolSchema).describe('Schools serving this home'),
    total_schools: z.number().describe('Total number of schools'),
  }),
  handle: async params => {
    const data = await api<BelowTheFoldPayload>('/stingray/api/home/details/belowTheFold', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    const schoolsInfo = data.schoolsAndDistrictsInfo;
    return {
      schools: (schoolsInfo?.servingThisHomeSchools ?? []).map(mapSchool),
      total_schools: schoolsInfo?.totalSchoolsServiced ?? 0,
    };
  },
});
