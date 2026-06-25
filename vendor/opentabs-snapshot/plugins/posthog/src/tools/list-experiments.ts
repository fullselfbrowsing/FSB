import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawExperiment,
  experimentSchema,
  mapExperiment,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listExperiments = defineTool({
  name: 'list_experiments',
  displayName: 'List Experiments',
  description: 'List A/B test experiments in the current PostHog project.',
  summary: 'List experiments',
  icon: 'flask-conical',
  group: 'Experiments',
  input: z.object({
    ...paginationInput.shape,
  }),
  output: z.object({
    experiments: z.array(experimentSchema).describe('List of experiments'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawExperiment>>(`/api/projects/${getTeamId()}/experiments/`, {
      query: { limit: params.limit, offset: params.offset },
    });
    return {
      experiments: (data.results ?? []).map(mapExperiment),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
