import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawExperiment, experimentSchema, mapExperiment } from './schemas.js';

export const getExperiment = defineTool({
  name: 'get_experiment',
  displayName: 'Get Experiment',
  description: 'Get detailed information about a specific experiment including its dates and feature flag key.',
  summary: 'Get experiment details',
  icon: 'flask-conical',
  group: 'Experiments',
  input: z.object({
    experiment_id: z.number().int().describe('Experiment ID'),
  }),
  output: z.object({
    experiment: experimentSchema.describe('The experiment details'),
  }),
  handle: async params => {
    const data = await api<RawExperiment>(`/api/projects/${getTeamId()}/experiments/${params.experiment_id}/`);

    return { experiment: mapExperiment(data) };
  },
});
