import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi } from '../gcloud-api.js';
import { bucketSchema, mapBucket } from './schemas.js';
import type { RawBucket } from './schemas.js';

export const getBucket = defineTool({
  name: 'get_bucket',
  displayName: 'Get Bucket',
  description: 'Get detailed information about a specific Cloud Storage bucket.',
  summary: 'Get a Cloud Storage bucket',
  icon: 'database',
  group: 'Storage',
  input: z.object({
    bucket_name: z.string().describe('Bucket name'),
  }),
  output: z.object({ bucket: bucketSchema }),
  handle: async params => {
    const data = await gcpApi<RawBucket>(`https://storage.googleapis.com/storage/v1/b/${params.bucket_name}`);
    return { bucket: mapBucket(data) };
  },
});
