// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bitbucket-api.js';

export const listPullRequests = defineTool({
  name: 'list_pull_requests',
  displayName: 'List Pull Requests',
  description: 'List pull requests in a Bitbucket repository. Optionally filter by state (OPEN, MERGED, DECLINED, SUPERSEDED).',
  summary: 'List pull requests in a repository',
  icon: 'list',
  group: 'Pull Requests',
  input: z.object({
    workspace: z.string().min(1).describe('Workspace ID or slug that owns the repository'),
    repo_slug: z.string().min(1).describe('Repository slug'),
    state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']).optional().describe('Filter by pull request state'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
  }),
  output: z.object({
    pullrequests: z
      .array(z.object({ id: z.number(), title: z.string() }))
      .describe('List of pull requests'),
  }),
  handle: async (params: { workspace: string; repo_slug: string }) => {
    // NEVER executed by the importer. Upstream: api GET /repositories/:ws/:repo/pullrequests (default method).
    const data = await api<{ pullrequests: Array<{ id: number; title: string }> }>(
      `/repositories/${params.workspace}/${params.repo_slug}/pullrequests`
    );
    return data;
  },
});
