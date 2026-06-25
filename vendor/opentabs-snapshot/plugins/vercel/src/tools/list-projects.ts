// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../vercel-api.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description: 'List projects in a Vercel team or personal account. Optionally search by project name.',
  summary: 'List projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    team_id: z.string().optional().describe('Team ID that owns the projects'),
    search: z.string().optional().describe('Search string to filter projects by name'),
    limit: z.number().int().optional().describe('Maximum number of projects to return'),
  }),
  output: z.object({
    projects: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .describe('List of projects'),
  }),
  handle: async (_params: { team_id?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v9/projects (default method).
    const data = await api<{ projects: Array<{ id: string; name: string }> }>(`/v9/projects`);
    return data;
  },
});
