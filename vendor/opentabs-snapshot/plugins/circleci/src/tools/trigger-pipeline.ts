import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawPipeline, mapPipeline, pipelineSchema } from './schemas.js';

export const triggerPipeline = defineTool({
  name: 'trigger_pipeline',
  displayName: 'Trigger Pipeline',
  description: 'Trigger a new pipeline on a project. Specify a branch or tag to build.',
  summary: 'Trigger a new pipeline',
  icon: 'play',
  group: 'Pipelines',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    branch: z.string().optional().describe('VCS branch to build'),
    tag: z.string().optional().describe('VCS tag to build'),
    parameters: z.record(z.string(), z.unknown()).optional().describe('Pipeline parameters as key-value pairs'),
  }),
  output: z.object({
    pipeline: pipelineSchema,
  }),
  handle: async ({ project_slug, branch, tag, parameters }) => {
    const data = await api<RawPipeline>(`/project/${project_slug}/pipeline`, {
      method: 'POST',
      body: stripUndefined({ branch, tag, parameters }),
    });
    return { pipeline: mapPipeline(data) };
  },
});
