import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { cloudFunctionSchema, mapCloudFunction } from './schemas.js';
import type { RawCloudFunction } from './schemas.js';

export const listFunctions = defineTool({
  name: 'list_functions',
  displayName: 'List Functions',
  description: 'List Cloud Functions in the project across all locations.',
  summary: 'List Cloud Functions',
  icon: 'zap',
  group: 'Cloud Functions',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    functions: z.array(cloudFunctionSchema).describe('List of Cloud Functions'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ functions?: RawCloudFunction[]; nextPageToken?: string }>(
      `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions`,
      { params: { pageSize: params.page_size ?? 50, pageToken: params.page_token } },
    );
    return {
      functions: (data.functions ?? []).map(mapCloudFunction),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
