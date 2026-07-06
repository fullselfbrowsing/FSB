import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { cloudRunServiceSchema, mapCloudRunService } from './schemas.js';
import type { RawCloudRunService } from './schemas.js';

export const getCloudRunService = defineTool({
  name: 'get_cloud_run_service',
  displayName: 'Get Cloud Run Service',
  description: 'Get detailed information about a specific Cloud Run service.',
  summary: 'Get a Cloud Run service',
  icon: 'rocket',
  group: 'Cloud Run',
  input: z.object({
    location: z.string().describe('Location (e.g., "us-central1")'),
    service_name: z.string().describe('Service name'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ service: cloudRunServiceSchema }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawCloudRunService>(
      `https://run.googleapis.com/v2/projects/${projectId}/locations/${params.location}/services/${params.service_name}`,
    );
    return { service: mapCloudRunService(data) };
  },
});
