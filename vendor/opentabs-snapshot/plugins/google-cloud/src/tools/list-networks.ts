import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { networkSchema, mapNetwork } from './schemas.js';
import type { RawNetwork } from './schemas.js';

export const listNetworks = defineTool({
  name: 'list_networks',
  displayName: 'List Networks',
  description: 'List VPC networks in the project.',
  summary: 'List VPC networks',
  icon: 'network',
  group: 'Compute',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    max_results: z.number().int().min(1).max(500).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    networks: z.array(networkSchema).describe('List of VPC networks'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ items?: RawNetwork[]; nextPageToken?: string }>(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/networks`,
      { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
    );
    return { networks: (data.items ?? []).map(mapNetwork), next_page_token: data.nextPageToken ?? '' };
  },
});
