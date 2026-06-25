import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { firewallSchema, mapFirewall } from './schemas.js';
import type { RawFirewall } from './schemas.js';

export const listFirewalls = defineTool({
  name: 'list_firewalls',
  displayName: 'List Firewalls',
  description: 'List firewall rules in the project.',
  summary: 'List firewall rules',
  icon: 'shield',
  group: 'Compute',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    max_results: z.number().int().min(1).max(500).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    firewalls: z.array(firewallSchema).describe('List of firewall rules'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ items?: RawFirewall[]; nextPageToken?: string }>(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/firewalls`,
      { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
    );
    return { firewalls: (data.items ?? []).map(mapFirewall), next_page_token: data.nextPageToken ?? '' };
  },
});
