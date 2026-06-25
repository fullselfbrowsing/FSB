import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { bucketSchema, mapBucket } from './schemas.js';

export const listBuckets = defineTool({
  name: 'list_buckets',
  displayName: 'List Storage Buckets',
  description: 'List all storage buckets for a Supabase project.',
  summary: 'List storage buckets',
  icon: 'hard-drive',
  group: 'Storage',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    buckets: z.array(bucketSchema).describe('List of storage buckets'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/storage/buckets`);
    return { buckets: data.map(mapBucket) };
  },
});
