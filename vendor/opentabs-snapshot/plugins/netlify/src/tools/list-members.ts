import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { memberSchema, type RawMember, mapMember } from './schemas.js';

export const listMembers = defineTool({
  name: 'list_members',
  displayName: 'List Members',
  description:
    'List all members of a Netlify account (team). Returns each member with their name, email, role, pending status, and MFA status.',
  summary: 'List account team members',
  icon: 'users',
  group: 'Members',
  input: z.object({
    account_slug: z.string().describe('The account slug to list members for'),
  }),
  output: z.object({
    items: z.array(memberSchema).describe('List of team members'),
  }),
  handle: async params => {
    const raw = await api<RawMember[]>(`/${params.account_slug}/members`);
    return { items: raw.map(mapMember) };
  },
});
