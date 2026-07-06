import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { vercelApi } from '../vercel-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all projects in the current Vercel team/account. Returns project names, frameworks, Git repos, and deployment status. Supports pagination.',
  summary: 'List all Vercel projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    limit: z.number().optional().describe('Maximum number of projects to return (default 20, max 100)'),
    from: z.string().optional().describe('Pagination cursor — project ID to start from (from previous response)'),
    search: z.string().optional().describe('Search projects by name'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    pagination: z
      .object({
        count: z.number().describe('Number of projects returned'),
        next: z.string().nullable().describe('Next page cursor (pass as "from" for next page)'),
      })
      .describe('Pagination info'),
  }),
  handle: async params => {
    const data = await vercelApi<Record<string, unknown>>('/v9/projects', {
      query: {
        limit: params.limit ?? 20,
        from: params.from,
        search: params.search,
      },
    });
    const projects = Array.isArray(data.projects) ? (data.projects as Record<string, unknown>[]) : [];
    const pagination = data.pagination as Record<string, unknown> | undefined;
    return {
      projects: projects.map(p => mapProject(p)),
      pagination: {
        count: (pagination?.count as number) ?? projects.length,
        next: (pagination?.next as string) ?? null,
      },
    };
  },
});
