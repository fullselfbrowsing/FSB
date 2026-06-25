// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const listPipelines = defineTool({
  name: 'list_pipelines',
  displayName: 'List Pipelines',
  description: 'List the pipelines for a CircleCI project. Optionally filter by branch.',
  summary: 'List pipelines for a project',
  icon: 'list',
  group: 'Pipelines',
  input: z.object({
    project_slug: z
      .string()
      .min(1)
      .describe('Project slug (vcs-type/org-name/repo-name, e.g. gh/acme/app)'),
    branch: z.string().optional().describe('Filter pipelines by branch name'),
    page_token: z.string().optional().describe('Pagination cursor for the next page'),
  }),
  output: z.object({
    pipelines: z
      .array(z.object({ id: z.string(), number: z.number() }))
      .describe('List of pipelines'),
  }),
  handle: async (params: { project_slug: string }) => {
    // NEVER executed by the importer. Upstream: api GET /project/:slug/pipeline (default method).
    const data = await api<{ pipelines: Array<{ id: string; number: number }> }>(
      `/project/${encodeURIComponent(params.project_slug)}/pipeline`
    );
    return data;
  },
});
