import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawExperiment, experimentSchema, mapExperiment } from './schemas.js';

export const createExperiment = defineTool({
  name: 'create_experiment',
  displayName: 'Create Experiment',
  description: 'Create a new A/B test experiment. Requires a name and feature flag key.',
  summary: 'Create a new experiment',
  icon: 'plus',
  group: 'Experiments',
  input: z.object({
    name: z.string().describe('Experiment name'),
    description: z.string().optional().describe('Description'),
    feature_flag_key: z.string().describe('Key for the associated feature flag'),
  }),
  output: z.object({
    experiment: experimentSchema.describe('The newly created experiment'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      feature_flag_key: params.feature_flag_key,
    };
    if (params.description !== undefined) body.description = params.description;

    const data = await api<RawExperiment>(`/api/projects/${getTeamId()}/experiments/`, { method: 'POST', body });

    return { experiment: mapExperiment(data) };
  },
});
