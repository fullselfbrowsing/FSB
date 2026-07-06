import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../posthog-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific PostHog project by its ID.',
  summary: 'Get project details',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_id: z.number().int().describe('Project ID'),
  }),
  output: z.object({
    project: projectSchema.describe('The project details'),
  }),
  handle: async params => {
    const orgId = getOrgId();
    const data = await api<RawProject>(`/api/organizations/${orgId}/projects/${params.project_id}/`);
    return { project: mapProject(data) };
  },
});
