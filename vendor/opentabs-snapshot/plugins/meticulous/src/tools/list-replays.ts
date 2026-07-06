import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { replaySchema, mapReplay } from './schemas.js';

export const listReplays = defineTool({
  name: 'list_replays',
  displayName: 'List Replays',
  description: 'List replays for a specific project.',
  summary: 'List replays for a project',
  icon: 'list',
  group: 'Replays',
  input: z.object({
    project_id: z.string().describe('Project ID'),
    count: z.number().optional().default(50).describe('Number of replays to return'),
  }),
  output: z.object({ replays: z.array(replaySchema) }),
  handle: async ({ project_id, count }) => {
    const data = await graphql<{ replaysForProject: Array<Record<string, unknown>> }>(queries.GET_REPLAYS_FOR_PROJECT, {
      projectId: project_id,
      n: count,
    });
    return { replays: (data.replaysForProject ?? []).map(mapReplay) };
  },
});
