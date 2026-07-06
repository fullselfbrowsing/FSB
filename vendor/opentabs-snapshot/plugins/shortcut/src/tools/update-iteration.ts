import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawIteration, iterationSchema, mapIteration } from './schemas.js';

export const updateIteration = defineTool({
  name: 'update_iteration',
  displayName: 'Update Iteration',
  description: 'Update an existing iteration. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an iteration',
  icon: 'pencil',
  group: 'Iterations',
  input: z.object({
    iteration_id: z.number().int().describe('Iteration numeric ID'),
    name: z.string().optional().describe('New iteration name'),
    start_date: z.string().optional().describe('New start date in YYYY-MM-DD'),
    end_date: z.string().optional().describe('New end date in YYYY-MM-DD'),
    description: z.string().optional().describe('New description'),
    label_ids: z.array(z.number().int()).optional().describe('Replace all labels with these IDs'),
    group_ids: z.array(z.string()).optional().describe('Replace all teams with these UUIDs'),
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
    const data = await api<RawIteration>(`/iterations/${params.iteration_id}`, { method: 'PUT', body });
    return { iteration: mapIteration(data) };
  },
});
