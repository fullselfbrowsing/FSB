import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi } from '../gcloud-api.js';
import { objectSchema, mapObject } from './schemas.js';
import type { RawObject } from './schemas.js';

export const listObjects = defineTool({
  name: 'list_objects',
  displayName: 'List Objects',
  description: 'List objects in a Cloud Storage bucket. Supports prefix filtering for directory-like browsing.',
  summary: 'List objects in a storage bucket',
  icon: 'file',
  group: 'Storage',
  input: z.object({
    bucket_name: z.string().describe('Bucket name'),
    prefix: z.string().optional().describe('Object name prefix for filtering (e.g., "logs/2024/")'),
    delimiter: z.string().optional().describe('Delimiter for directory-like listing (typically "/")'),
    max_results: z.number().int().min(1).max(1000).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    objects: z.array(objectSchema).describe('List of objects'),
    prefixes: z.array(z.string()).describe('Common prefixes (subdirectories when delimiter is used)'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const data = await gcpApi<{ items?: RawObject[]; prefixes?: string[]; nextPageToken?: string }>(
      `https://storage.googleapis.com/storage/v1/b/${params.bucket_name}/o`,
      {
        params: {
          prefix: params.prefix,
          delimiter: params.delimiter,
          maxResults: params.max_results ?? 50,
          pageToken: params.page_token,
        },
      },
    );
    return {
      objects: (data.items ?? []).map(mapObject),
      prefixes: data.prefixes ?? [],
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
