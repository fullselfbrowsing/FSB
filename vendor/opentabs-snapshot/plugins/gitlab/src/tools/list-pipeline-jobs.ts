import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { jobSchema, mapJob } from './schemas.js';

export const listPipelineJobs = defineTool({
  name: 'list_pipeline_jobs',
  displayName: 'List Pipeline Jobs',
  description: 'List jobs for a specific pipeline.',
  summary: 'List jobs for a pipeline',
  icon: 'play',
  group: 'CI/CD',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    pipeline_id: z.number().int().min(1).describe('Pipeline ID'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    jobs: z.array(jobSchema).describe('List of jobs'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      per_page: params.per_page ?? 20,
      page: params.page,
    };

    const data = await api<Record<string, unknown>[]>(
      `/projects/${encodeURIComponent(params.project)}/pipelines/${params.pipeline_id}/jobs`,
      { query },
    );
    return { jobs: (data ?? []).map(mapJob) };
  },
});
