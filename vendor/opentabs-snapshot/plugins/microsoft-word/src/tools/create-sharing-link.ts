import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawPermission, mapPermission, permissionSchema } from './schemas.js';

export const createSharingLink = defineTool({
  name: 'create_sharing_link',
  displayName: 'Create Sharing Link',
  description: 'Create a sharing link for a file or folder. Returns a URL that can be shared with others.',
  summary: 'Create a sharing link for a file or folder',
  icon: 'link',
  group: 'Sharing',
  input: z.object({
    item_id: z.string().describe('File or folder ID'),
    type: z.enum(['view', 'edit', 'embed']).optional().describe('Link type (default "view")'),
    scope: z.enum(['anonymous', 'organization']).optional().describe('Link scope (default "anonymous")'),
  }),
  output: z.object({
    permission: permissionSchema.describe('The created sharing permission'),
  }),
  handle: async params => {
    const data = await api<RawPermission>(`/me/drive/items/${params.item_id}/createLink`, {
      method: 'POST',
      body: {
        type: params.type ?? 'view',
        scope: params.scope ?? 'anonymous',
      },
    });
    return { permission: mapPermission(data) };
  },
});
