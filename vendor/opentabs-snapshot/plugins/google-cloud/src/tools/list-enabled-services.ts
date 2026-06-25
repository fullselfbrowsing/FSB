import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { serviceSchema, mapService } from './schemas.js';
import type { RawService } from './schemas.js';

export const listEnabledServices = defineTool({
  name: 'list_enabled_services',
  displayName: 'List Enabled Services',
  description: 'List GCP API services enabled in the project. Each service represents an API that has been activated.',
  summary: 'List enabled API services',
  icon: 'puzzle',
  group: 'Services',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    page_size: z.number().int().min(1).max(200).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    services: z.array(serviceSchema).describe('List of enabled services'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ services?: RawService[]; nextPageToken?: string }>(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services`,
      { params: { pageSize: params.page_size ?? 50, pageToken: params.page_token, filter: 'state:ENABLED' } },
    );
    return { services: (data.services ?? []).map(mapService), next_page_token: data.nextPageToken ?? '' };
  },
});
