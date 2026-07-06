import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all projects for the current Sentry organization. Returns project name, slug, platform, ' +
    'and access status. Use the project slug for filtering issues or retrieving events.',
  summary: 'List all projects in the organization',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(`/organizations/${orgSlug}/projects/`, {
      query: { cursor: params.cursor },
    });
    return {
      projects: (Array.isArray(data) ? data : []).map(p => mapProject(p)),
      cursor: nextCursor ?? '',
    };
  },
});
