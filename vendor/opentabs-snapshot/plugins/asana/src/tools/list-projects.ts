import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, PROJECT_OPT_FIELDS, type RawProject, mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List projects in a workspace. Returns projects sorted by name with optional filtering by archived status. Supports pagination via offset.',
  summary: 'List projects in a workspace',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    workspace_gid: z.string().min(1).describe('Workspace GID to list projects from'),
    archived: z.boolean().optional().describe('Filter by archived status (default: false)'),
    limit: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset from a previous response'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    next_page: z.string().nullable().describe('Pagination offset for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawProject>>('/projects', {
      query: {
        workspace: params.workspace_gid,
        opt_fields: PROJECT_OPT_FIELDS,
        limit: params.limit ?? 20,
        archived: params.archived,
        offset: params.offset,
      },
    });
    return {
      projects: (data.data ?? []).map(mapProject),
      next_page: data.next_page?.offset ?? null,
    };
  },
});
