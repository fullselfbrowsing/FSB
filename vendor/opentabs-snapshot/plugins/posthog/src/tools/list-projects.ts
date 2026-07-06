import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawProject,
  mapProject,
  paginationInput,
  paginationOutput,
  projectSchema,
} from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all projects in the current PostHog organization. Projects contain events, dashboards, feature flags, and other analytics data.',
  summary: 'List projects in the organization',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    ...paginationInput.shape,
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const orgId = getOrgId();
    const data = await api<PaginatedResponse<RawProject>>(`/api/organizations/${orgId}/projects/`, {
      query: { limit: params.limit, offset: params.offset },
    });
    return {
      projects: (data.results ?? []).map(mapProject),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
