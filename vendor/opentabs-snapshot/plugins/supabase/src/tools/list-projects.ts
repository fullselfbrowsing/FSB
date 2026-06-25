import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all Supabase projects for the authenticated user. Returns project IDs, names, regions, and status.',
  summary: 'List all Supabase projects',
  icon: 'layers',
  group: 'Projects',
  input: z.object({}),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
  }),
  handle: async () => {
    const data = await api<Record<string, unknown>[]>('/projects');
    return { projects: data.map(mapProject) };
  },
});
