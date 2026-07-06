import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawAbout, mapUser, mapStorageQuota, userSchema, storageQuotaSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Google Drive user profile including display name, email, and storage quota. Uses the Drive v3 About endpoint.',
  summary: 'Get Drive user profile and storage info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema,
    storage_quota: storageQuotaSchema,
  }),
  handle: async () => {
    const data = await api<RawAbout>('/about', {
      params: { fields: 'user(displayName,emailAddress,permissionId,photoLink),storageQuota' },
    });
    return {
      user: mapUser(data.user ?? {}),
      storage_quota: mapStorageQuota(data.storageQuota ?? {}),
    };
  },
});
