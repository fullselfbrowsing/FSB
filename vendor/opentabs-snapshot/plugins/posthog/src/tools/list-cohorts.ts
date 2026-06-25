import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawCohort,
  cohortSchema,
  mapCohort,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listCohorts = defineTool({
  name: 'list_cohorts',
  displayName: 'List Cohorts',
  description:
    'List cohorts in the current PostHog project. Cohorts are groups of persons defined by shared properties or behaviors.',
  summary: 'List cohorts',
  icon: 'users-round',
  group: 'Cohorts',
  input: z.object({
    ...paginationInput.shape,
  }),
  output: z.object({
    cohorts: z.array(cohortSchema).describe('List of cohorts'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawCohort>>(`/api/projects/${getTeamId()}/cohorts/`, {
      query: { limit: params.limit, offset: params.offset },
    });
    return {
      cohorts: (data.results ?? []).map(mapCohort),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
