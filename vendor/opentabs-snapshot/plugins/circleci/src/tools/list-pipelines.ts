import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawPipeline, mapPipeline, pipelineSchema } from './schemas.js';

export const listPipelines = defineTool({
  name: 'list_pipelines',
  displayName: 'List Pipelines',
  description:
    'List recent pipelines for a project. Requires project_slug (e.g., "gh/org/repo"). Supports filtering by branch.',
  summary: 'List pipelines for a project',
  icon: 'git-branch',
  group: 'Pipelines',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    branch: z.string().optional().describe('Filter pipelines by VCS branch name'),
    mine: z.boolean().optional().describe('Only return pipelines triggered by the current user'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    pipelines: z.array(pipelineSchema).describe('List of pipelines'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ project_slug, branch, mine, page_token }) => {
    const data = await api<Paginated<RawPipeline>>(`/project/${project_slug}/pipeline`, {
      query: { branch, mine, 'page-token': page_token },
    });
    return {
      pipelines: (data.items ?? []).map(mapPipeline),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
