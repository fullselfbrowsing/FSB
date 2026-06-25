import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawArtifact, artifactSchema, mapArtifact } from './schemas.js';

export const getJobArtifacts = defineTool({
  name: 'get_job_artifacts',
  displayName: 'Get Job Artifacts',
  description: 'List artifacts produced by a job. Returns file paths and download URLs.',
  summary: 'List job artifacts',
  icon: 'file-archive',
  group: 'Jobs',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    job_number: z.number().int().describe('Job number within the project'),
  }),
  output: z.object({
    artifacts: z.array(artifactSchema).describe('List of artifacts'),
    next_page_token: z.string().describe('Token for the next page of results'),
  }),
  handle: async ({ project_slug, job_number }) => {
    const data = await api<Paginated<RawArtifact>>(`/project/${project_slug}/${job_number}/artifacts`);
    return {
      artifacts: (data.items ?? []).map(mapArtifact),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
