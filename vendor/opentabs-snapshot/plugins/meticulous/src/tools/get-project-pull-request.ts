import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { pullRequestSchema, mapPullRequest } from './schemas.js';

export const getProjectPullRequest = defineTool({
  name: 'get_project_pull_request',
  displayName: 'Get Project Pull Request',
  description:
    'Get the Meticulous test status for a specific pull request by its hosting provider ID (e.g., GitHub PR number).',
  summary: 'Get PR test status',
  icon: 'git-pull-request',
  group: 'Projects',
  input: z.object({
    organization_name: z.string().describe('Organization name'),
    project_name: z.string().describe('Project name'),
    pull_request_id: z.string().describe('Hosting provider PR identifier (e.g., GitHub PR number as string)'),
  }),
  output: z.object({ pull_request: pullRequestSchema.nullable() }),
  handle: async ({ organization_name, project_name, pull_request_id }) => {
    const data = await graphql<{ project: { pullRequest: Record<string, unknown> | null } }>(
      queries.GET_PROJECT_PULL_REQUEST,
      { organizationName: organization_name, projectName: project_name, pullRequestId: pull_request_id },
    );
    return { pull_request: data.project.pullRequest ? mapPullRequest(data.project.pullRequest) : null };
  },
});
