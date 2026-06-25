// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../sentry-api.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description: 'List the projects for a Sentry organization.',
  summary: 'List projects in the organization',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    organization_slug: z.string().min(1).describe('Sentry organization slug'),
    cursor: z.string().optional().describe('Pagination cursor for the next page'),
  }),
  output: z.object({
    projects: z
      .array(z.object({ id: z.string(), slug: z.string() }))
      .describe('List of projects'),
  }),
  handle: async (params: { organization_slug: string }) => {
    // NEVER executed by the importer. Upstream: api GET /organizations/:org/projects/ (default method).
    const data = await api<{ projects: Array<{ id: string; slug: string }> }>(
      `/organizations/${encodeURIComponent(params.organization_slug)}/projects/`
    );
    return data;
  },
});
