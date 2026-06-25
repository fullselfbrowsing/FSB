import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawCohort, cohortSchema, mapCohort } from './schemas.js';

export const getCohort = defineTool({
  name: 'get_cohort',
  displayName: 'Get Cohort',
  description: 'Get detailed information about a specific cohort including its person count and calculation status.',
  summary: 'Get cohort details',
  icon: 'users-round',
  group: 'Cohorts',
  input: z.object({
    cohort_id: z.number().int().describe('Cohort ID'),
  }),
  output: z.object({
    cohort: cohortSchema.describe('The cohort details'),
  }),
  handle: async params => {
    const data = await api<RawCohort>(`/api/projects/${getTeamId()}/cohorts/${params.cohort_id}/`);
    return { cohort: mapCohort(data) };
  },
});
