import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawIteration, iterationSchema, mapIteration } from './schemas.js';

export const getIteration = defineTool({
  name: 'get_iteration',
  displayName: 'Get Iteration',
  description: 'Get detailed information about a specific iteration (sprint) by its numeric ID.',
  summary: 'Get an iteration by ID',
  icon: 'repeat',
  group: 'Iterations',
  input: z.object({
    iteration_id: z.number().int().describe('Iteration numeric ID'),
  }),
  output: z.object({ iteration: iterationSchema }),
  handle: async params => {
    const data = await api<RawIteration>(`/iterations/${params.iteration_id}`);
    return { iteration: mapIteration(data) };
  },
});
