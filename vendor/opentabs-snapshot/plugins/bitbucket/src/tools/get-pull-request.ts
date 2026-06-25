// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bitbucket-api.js';

export const getPullRequest = defineTool({
  name: 'get_pull_request',
  displayName: 'Get Pull Request',
  description: 'Get detailed information about a specific Bitbucket pull request by its repository and ID.',
  summary: 'Get a pull request by ID',
  icon: 'git-pull-request',
  group: 'Pull Requests',
  input: z.object({
    workspace: z.string().min(1).describe('Workspace ID or slug that owns the repository'),
    repo_slug: z.string().min(1).describe('Repository slug'),
    pull_request_id: z.number().int().describe('Pull request ID within the repository'),
  }),
  output: z.object({
    id: z.number().describe('Pull request ID'),
    title: z.string().describe('Pull request title'),
    state: z.string().optional().describe('Pull request state'),
  }),
  handle: async (params: { workspace: string; repo_slug: string; pull_request_id: number }) => {
    // NEVER executed by the importer. Upstream: api GET /repositories/:ws/:repo/pullrequests/:id (default method).
    const data = await api<{ id: number; title: string }>(
      `/repositories/${params.workspace}/${params.repo_slug}/pullrequests/${params.pull_request_id}`
    );
    return data;
  },
});
