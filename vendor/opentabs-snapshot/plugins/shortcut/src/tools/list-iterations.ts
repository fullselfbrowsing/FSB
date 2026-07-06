import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawIteration, iterationSchema, mapIteration } from './schemas.js';

export const listIterations = defineTool({
  name: 'list_iterations',
  displayName: 'List Iterations',
  description: 'List all iterations (sprints) in the workspace. Returns iteration name, date range, and status.',
  summary: 'List all iterations',
  icon: 'repeat',
  group: 'Iterations',
  input: z.object({}),
  output: z.object({ iterations: z.array(iterationSchema).describe('All iterations') }),
  handle: async () => {
    const data = await api<RawIteration[]>('/iterations');
    return { iterations: (data ?? []).map(mapIteration) };
  },
});
