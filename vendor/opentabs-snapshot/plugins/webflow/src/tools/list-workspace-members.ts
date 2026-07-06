import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { memberSchema, inviteSchema, mapMember, mapInvite } from './schemas.js';
import type { RawMember, RawInvite } from './schemas.js';

interface MembersResponse {
  members?: RawMember[];
  invites?: RawInvite[];
}

export const listWorkspaceMembers = defineTool({
  name: 'list_workspace_members',
  displayName: 'List Workspace Members',
  description:
    'List all members and pending invites for a Webflow workspace. Returns member details including name, email, role, and 2FA status.',
  summary: 'List workspace members',
  icon: 'users',
  group: 'Workspaces',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug'),
  }),
  output: z.object({
    members: z.array(memberSchema),
    invites: z.array(inviteSchema),
  }),
  handle: async params => {
    const data = await api<MembersResponse>(`/workspaces/${params.workspace_slug}/members`);
    return {
      members: (data.members ?? []).map(mapMember),
      invites: (data.invites ?? []).map(mapInvite),
    };
  },
});
