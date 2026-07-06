import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawPipeline, mapPipeline, pipelineSchema } from './schemas.js';

export const getPipeline = defineTool({
  name: 'get_pipeline',
  displayName: 'Get Pipeline',
  description:
    'Get a single pipeline by its UUID. Returns pipeline details including state, trigger info, and VCS data.',
  summary: 'Get a pipeline by ID',
  icon: 'git-branch',
  group: 'Pipelines',
  input: z.object({
    pipeline_id: z.string().describe('Pipeline UUID'),
  }),
  output: z.object({
    pipeline: pipelineSchema,
  }),
  handle: async ({ pipeline_id }) => {
    const data = await api<RawPipeline>(`/pipeline/${pipeline_id}`);
    return { pipeline: mapPipeline(data) };
  },
});
