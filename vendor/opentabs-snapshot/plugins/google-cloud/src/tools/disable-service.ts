import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';

export const disableService = defineTool({
  name: 'disable_service',
  displayName: 'Disable Service',
  description:
    'Disable a GCP API service in the project. WARNING: This may break resources that depend on this service.',
  summary: 'Disable a GCP API service',
  icon: 'toggle-left',
  group: 'Services',
  input: z.object({
    service_name: z.string().describe('Service API name (e.g., "compute.googleapis.com")'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation was initiated') }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    await gcpApi(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${params.service_name}:disable`,
      { method: 'POST', body: {} },
    );
    return { success: true };
  },
});
