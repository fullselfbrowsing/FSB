import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { bucketSchema, mapBucket } from './schemas.js';
import type { RawBucket } from './schemas.js';

export const listBuckets = defineTool({
  name: 'list_buckets',
  displayName: 'List Buckets',
  description: 'List Cloud Storage buckets in the project.',
  summary: 'List Cloud Storage buckets',
  icon: 'database',
  group: 'Storage',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    max_results: z.number().int().min(1).max(1000).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    buckets: z.array(bucketSchema).describe('List of storage buckets'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ items?: RawBucket[]; nextPageToken?: string }>(
      'https://storage.googleapis.com/storage/v1/b',
      { params: { project: projectId, maxResults: params.max_results ?? 50, pageToken: params.page_token } },
    );
    return { buckets: (data.items ?? []).map(mapBucket), next_page_token: data.nextPageToken ?? '' };
  },
});
