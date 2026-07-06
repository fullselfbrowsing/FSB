import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const listExperiments = defineTool({
  name: 'list_experiments',
  displayName: 'List Experiments',
  description:
    'List all active feature experiments and their values for the current Retool organization. Experiments control feature flags and A/B tests.',
  summary: 'List active feature experiments',
  icon: 'flask-conical',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    experiments: z
      .record(z.string(), z.unknown())
      .describe('Map of experiment names to their values (booleans, strings, or objects)'),
  }),
  handle: async () => {
    const data = await api<Record<string, unknown>>('/api/experiments');
    return { experiments: data ?? {} };
  },
});
