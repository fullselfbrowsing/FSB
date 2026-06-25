import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-drive-api.js';
import { type RawPermission, permissionSchema, mapPermission } from './schemas.js';

export const createPermission = defineTool({
  name: 'create_permission',
  displayName: 'Share File',
  description:
    'Share a file or folder with a user, group, domain, or make it public. For user/group sharing, provide an email address. For domain sharing, provide a domain name. Use type "anyone" to make the file accessible via link.',
  summary: 'Share a file with someone',
  icon: 'user-plus',
  group: 'Sharing',
  input: z.object({
    file_id: z.string().describe('File or folder ID to share'),
    type: z
      .enum(['user', 'group', 'domain', 'anyone'])
      .describe('Permission type: "user", "group", "domain", or "anyone" (public link)'),
    role: z
      .enum(['reader', 'commenter', 'writer', 'fileOrganizer', 'organizer'])
      .describe('Permission role: "reader", "commenter", "writer", "fileOrganizer", or "organizer"'),
    email: z.string().optional().describe('Email address of the user or group (required for user/group types)'),
    domain: z.string().optional().describe('Domain name (required for domain type)'),
    send_notification: z.boolean().optional().describe('Send email notification to the grantee (default true)'),
  }),
  output: z.object({
    permission: permissionSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      type: params.type,
      role: params.role,
    };
    if (params.email) body.emailAddress = params.email;
    if (params.domain) body.domain = params.domain;

    const data = await api<RawPermission>(`/files/${encodeURIComponent(params.file_id)}/permissions`, {
      method: 'POST',
      params: {
        fields: 'id,type,role,emailAddress,displayName,domain',
        sendNotificationEmail: params.send_notification ?? true,
      },
      body,
    });
    return { permission: mapPermission(data) };
  },
});
