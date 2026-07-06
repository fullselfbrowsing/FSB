import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';

export const enableService = defineTool({
  name: 'enable_service',
  displayName: 'Enable Service',
  description:
    'Enable a GCP API service in the project. The service name is the API identifier (e.g., "compute.googleapis.com").',
  summary: 'Enable a GCP API service',
  icon: 'toggle-right',
  group: 'Services',
  input: z.object({
    service_name: z.string().describe('Service API name (e.g., "compute.googleapis.com")'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation was initiated') }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    await gcpApi(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${params.service_name}:enable`,
      { method: 'POST', body: {} },
    );
    return { success: true };
  },
});
