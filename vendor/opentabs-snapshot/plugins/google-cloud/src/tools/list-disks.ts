import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { diskSchema, mapDisk } from './schemas.js';
import type { RawDisk } from './schemas.js';

export const listDisks = defineTool({
  name: 'list_disks',
  displayName: 'List Disks',
  description: 'List Compute Engine persistent disks. If no zone is specified, lists across all zones.',
  summary: 'List persistent disks',
  icon: 'hard-drive',
  group: 'Compute',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    zone: z.string().optional().describe('Zone (e.g., "us-central1-a"). If omitted, lists across all zones.'),
    max_results: z.number().int().min(1).max(500).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    disks: z.array(diskSchema).describe('List of persistent disks'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    if (params.zone) {
      const data = await gcpApi<{ items?: RawDisk[]; nextPageToken?: string }>(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${params.zone}/disks`,
        { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
      );
      return { disks: (data.items ?? []).map(mapDisk), next_page_token: data.nextPageToken ?? '' };
    }
    const data = await gcpApi<{ items?: Record<string, { disks?: RawDisk[] }>; nextPageToken?: string }>(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/disks`,
      { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
    );
    const disks: RawDisk[] = [];
    if (data.items) {
      for (const zone of Object.values(data.items)) {
        if (zone.disks) disks.push(...zone.disks);
      }
    }
    return { disks: disks.map(mapDisk), next_page_token: data.nextPageToken ?? '' };
  },
});
