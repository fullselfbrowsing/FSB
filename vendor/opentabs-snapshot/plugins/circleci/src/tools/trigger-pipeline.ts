// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const triggerPipeline = defineTool({
  name: 'trigger_pipeline',
  displayName: 'Trigger Pipeline',
  description:
    'Trigger a new pipeline run for a CircleCI project on a given branch or tag. Optionally pass pipeline parameters.',
  summary: 'Trigger a new pipeline',
  icon: 'play',
  group: 'Pipelines',
  input: z.object({
    project_slug: z
      .string()
      .min(1)
      .describe('Project slug (vcs-type/org-name/repo-name, e.g. gh/acme/app)'),
    branch: z.string().optional().describe('Branch to run the pipeline on'),
    tag: z.string().optional().describe('Tag to run the pipeline on (mutually exclusive with branch)'),
    parameters: z.record(z.string(), z.unknown()).optional().describe('Pipeline parameters to pass'),
  }),
  output: z.object({
    id: z.string().describe('The triggered pipeline ID'),
    number: z.number().describe('The triggered pipeline number'),
  }),
  handle: async (params: { project_slug: string; branch?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /project/:slug/pipeline.
    // `trigger` is NOT a recognized side-effect verb, so the {method:'POST'} literal
    // is what floors this op to WRITE (methodClass POST -> write).
    const data = await api<{ id: string; number: number }>(
      `/project/${encodeURIComponent(params.project_slug)}/pipeline`,
      {
        method: 'POST',
        body: { branch: params.branch },
      }
    );
    return data;
  },
});
