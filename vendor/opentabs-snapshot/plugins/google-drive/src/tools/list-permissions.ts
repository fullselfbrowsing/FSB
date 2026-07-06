import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawPermission, permissionSchema, mapPermission } from './schemas.js';

export const listPermissions = defineTool({
  name: 'list_permissions',
  displayName: 'List Permissions',
  description:
    'List all sharing permissions on a file or folder. Returns who has access and their role (owner, writer, commenter, reader).',
  summary: 'List sharing permissions on a file',
  icon: 'users',
  group: 'Sharing',
  input: z.object({
    file_id: z.string().describe('File or folder ID'),
  }),
  output: z.object({
    permissions: z.array(permissionSchema).describe('List of sharing permissions'),
  }),
  handle: async params => {
    const data = await api<{ permissions?: RawPermission[] }>(
      `/files/${encodeURIComponent(params.file_id)}/permissions`,
      {
        params: { fields: 'permissions(id,type,role,emailAddress,displayName,domain)' },
      },
    );
    return { permissions: (data.permissions ?? []).map(mapPermission) };
  },
});
