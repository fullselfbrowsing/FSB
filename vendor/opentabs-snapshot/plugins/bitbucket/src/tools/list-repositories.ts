// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bitbucket-api.js';

export const listRepositories = defineTool({
  name: 'list_repositories',
  displayName: 'List Repositories',
  description: 'List repositories in a Bitbucket workspace. Optionally filter by role or query the repository name.',
  summary: 'List repositories in a workspace',
  icon: 'folder-git',
  group: 'Repositories',
  input: z.object({
    workspace: z.string().min(1).describe('Workspace ID or slug to list repositories for'),
    role: z.enum(['owner', 'admin', 'contributor', 'member']).optional().describe('Filter by the caller role on the repository'),
    q: z.string().optional().describe('Query string to filter repositories (BBQL)'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
  }),
  output: z.object({
    values: z
      .array(z.object({ uuid: z.string(), name: z.string() }))
      .describe('List of repositories'),
  }),
  handle: async (params: { workspace: string }) => {
    // NEVER executed by the importer. Upstream: api GET /repositories/:workspace (default method).
    const data = await api<{ values: Array<{ uuid: string; name: string }> }>(
      `/repositories/${params.workspace}`
    );
    return data;
  },
});
