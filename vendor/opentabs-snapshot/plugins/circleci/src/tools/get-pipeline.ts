// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const getPipeline = defineTool({
  name: 'get_pipeline',
  displayName: 'Get Pipeline',
  description: 'Get detailed information about a single CircleCI pipeline by its pipeline ID.',
  summary: 'Get a pipeline by id',
  icon: 'git-commit',
  group: 'Pipelines',
  input: z.object({
    pipeline_id: z.string().min(1).describe('CircleCI pipeline ID (UUID)'),
  }),
  output: z.object({
    id: z.string().describe('Pipeline ID'),
    number: z.number().describe('Pipeline number'),
    state: z.string().optional().describe('Pipeline state'),
  }),
  handle: async (params: { pipeline_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /pipeline/:id (default method).
    const data = await api<{ id: string; number: number }>(
      `/pipeline/${encodeURIComponent(params.pipeline_id)}`
    );
    return data;
  },
});
