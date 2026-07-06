import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description:
    'Get detailed information about a specific Supabase project by its reference ID. Returns name, region, status, and organization.',
  summary: 'Get details of a specific project',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID (e.g., "abcdefghijklmnopqrst")'),
  }),
  output: z.object({
    project: projectSchema.describe('Project details'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/projects/${params.ref}`);
    return { project: mapProject(data) };
  },
});
