import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { mapStorageQuota, mapUser, type RawAbout, storageQuotaSchema, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Google account profile and Drive storage quota that back the current Google Docs session.',
  summary: 'Get the current Google user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema,
    storage_quota: storageQuotaSchema,
  }),
  handle: async () => {
    const data = await driveApi<RawAbout>('/about', {
      params: { fields: 'user(displayName,emailAddress,permissionId,photoLink),storageQuota' },
    });

    return {
      user: mapUser(data.user ?? {}),
      storage_quota: mapStorageQuota(data.storageQuota ?? {}),
    };
  },
});
