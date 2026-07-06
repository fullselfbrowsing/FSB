import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi } from '../gcloud-api.js';
import { projectSchema, mapProjectV1 } from './schemas.js';
import type { RawProjectV1 } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all GCP projects accessible to the current user. Returns project IDs, names, and lifecycle states.',
  summary: 'List accessible GCP projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    page_size: z.number().int().min(1).max(100).optional().describe('Max results per page (default 50, max 100)'),
    page_token: z.string().optional().describe('Page token from a previous response for pagination'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const data = await gcpApi<{ projects?: RawProjectV1[]; nextPageToken?: string }>(
      'https://cloudresourcemanager.googleapis.com/v1/projects',
      {
        params: {
          pageSize: params.page_size ?? 50,
          pageToken: params.page_token,
        },
      },
    );
    return {
      projects: (data.projects ?? []).map(mapProjectV1),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
