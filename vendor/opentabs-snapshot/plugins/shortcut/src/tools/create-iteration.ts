import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawIteration, iterationSchema, mapIteration } from './schemas.js';

export const createIteration = defineTool({
  name: 'create_iteration',
  displayName: 'Create Iteration',
  description: 'Create a new iteration (sprint). Requires name, start date, and end date.',
  summary: 'Create a new iteration',
  icon: 'plus',
  group: 'Iterations',
  input: z.object({
    name: z.string().describe('Iteration name'),
    start_date: z.string().describe('Start date in YYYY-MM-DD format'),
    end_date: z.string().describe('End date in YYYY-MM-DD format'),
    description: z.string().optional().describe('Iteration description'),
    label_ids: z.array(z.number().int()).optional().describe('Label IDs to attach'),
    group_ids: z.array(z.string()).optional().describe('Team UUIDs to associate'),
  }),
  output: z.object({ iteration: iterationSchema }),
  handle: async params => {
    const body = stripUndefined({
      name: params.name,
      start_date: params.start_date,
      end_date: params.end_date,
      description: params.description,
      labels: params.label_ids?.map(id => ({ id })),
      group_ids: params.group_ids,
    });
    const data = await api<RawIteration>('/iterations', { method: 'POST', body });
    return { iteration: mapIteration(data) };
  },
});
