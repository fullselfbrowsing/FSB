import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawAbout, mapStorageQuota, storageQuotaSchema } from './schemas.js';

export const getStorageQuota = defineTool({
  name: 'get_storage_quota',
  displayName: 'Get Storage Quota',
  description:
    'Get the current Google Drive storage quota including total limit, usage, usage in Drive, and usage in trash. All values are in bytes.',
  summary: 'Get Drive storage usage and limits',
  icon: 'hard-drive',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    storage_quota: storageQuotaSchema,
  }),
  handle: async () => {
    const data = await api<RawAbout>('/about', {
      params: { fields: 'storageQuota' },
    });
    return { storage_quota: mapStorageQuota(data.storageQuota ?? {}) };
  },
});
