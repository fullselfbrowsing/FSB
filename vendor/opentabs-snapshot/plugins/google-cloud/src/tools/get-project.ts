import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { projectSchema, mapProjectV3 } from './schemas.js';
import type { RawProjectV3 } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description:
    'Get detailed information about a GCP project by its project ID. Defaults to the currently active project if no ID is provided.',
  summary: 'Get details about a GCP project',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({
    project: projectSchema,
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawProjectV3>(`https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}`);
    return { project: mapProjectV3(data) };
  },
});
