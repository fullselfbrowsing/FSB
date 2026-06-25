import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { cloudRunServiceSchema, mapCloudRunService } from './schemas.js';
import type { RawCloudRunService } from './schemas.js';

export const listCloudRunServices = defineTool({
  name: 'list_cloud_run_services',
  displayName: 'List Cloud Run Services',
  description: 'List Cloud Run services in the project across all locations.',
  summary: 'List Cloud Run services',
  icon: 'rocket',
  group: 'Cloud Run',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    services: z.array(cloudRunServiceSchema).describe('List of Cloud Run services'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ services?: RawCloudRunService[]; nextPageToken?: string }>(
      `https://run.googleapis.com/v2/projects/${projectId}/locations/-/services`,
      { params: { pageSize: params.page_size ?? 50, pageToken: params.page_token } },
    );
    return {
      services: (data.services ?? []).map(mapCloudRunService),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
