// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const listWorkflows = defineTool({
  name: 'list_workflows',
  displayName: 'List Workflows',
  description: 'List the workflows for a CircleCI pipeline by its pipeline ID.',
  summary: 'List workflows for a pipeline',
  icon: 'list',
  group: 'Workflows',
  input: z.object({
    pipeline_id: z.string().min(1).describe('CircleCI pipeline ID the workflows belong to'),
    page_token: z.string().optional().describe('Pagination cursor for the next page'),
  }),
  output: z.object({
    workflows: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .describe('List of workflows'),
  }),
  handle: async (params: { pipeline_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /pipeline/:id/workflow (default method).
    const data = await api<{ workflows: Array<{ id: string; name: string }> }>(
      `/pipeline/${encodeURIComponent(params.pipeline_id)}/workflow`
    );
    return data;
  },
});
