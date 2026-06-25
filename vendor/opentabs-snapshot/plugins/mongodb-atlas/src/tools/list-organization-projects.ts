import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../atlas-api.js';
import { type RawOrgProject, mapOrgProject, orgProjectSchema } from './schemas.js';

export const listOrganizationProjects = defineTool({
  name: 'list_organization_projects',
  displayName: 'List Organization Projects',
  description:
    'List all projects (groups) in the current MongoDB Atlas organization with cluster, user, and alert counts.',
  summary: 'List projects in the organization',
  icon: 'folder',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({ projects: z.array(orgProjectSchema).describe('Organization projects') }),
  handle: async () => {
    const orgId = getOrgId();
    const raw = await api<RawOrgProject[]>(`/orgs/${orgId}/groups`);
    return { projects: (raw ?? []).map(mapOrgProject) };
  },
});
