import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { instanceSchema, mapInstance } from './schemas.js';
import type { RawInstance } from './schemas.js';

export const listInstances = defineTool({
  name: 'list_instances',
  displayName: 'List Instances',
  description:
    'List Compute Engine VM instances in a zone. If no zone is specified, lists instances across all zones using aggregated list.',
  summary: 'List Compute Engine VM instances',
  icon: 'server',
  group: 'Compute',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    zone: z.string().optional().describe('Zone (e.g., "us-central1-a"). If omitted, lists across all zones.'),
    max_results: z.number().int().min(1).max(500).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    instances: z.array(instanceSchema).describe('List of VM instances'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    if (params.zone) {
      const data = await gcpApi<{ items?: RawInstance[]; nextPageToken?: string }>(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${params.zone}/instances`,
        { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
      );
      return {
        instances: (data.items ?? []).map(mapInstance),
        next_page_token: data.nextPageToken ?? '',
      };
    }
    // Aggregated list across all zones
    const data = await gcpApi<{ items?: Record<string, { instances?: RawInstance[] }>; nextPageToken?: string }>(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/instances`,
      { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
    );
    const instances: RawInstance[] = [];
    if (data.items) {
      for (const zone of Object.values(data.items)) {
        if (zone.instances) instances.push(...zone.instances);
      }
    }
    return {
      instances: instances.map(mapInstance),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
