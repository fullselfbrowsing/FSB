import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { memberSchema, type RawMember, mapMember } from './schemas.js';

export const getMember = defineTool({
  name: 'get_member',
  displayName: 'Get Member',
  description:
    'Get detailed information about a specific team member in a Netlify account by their member ID. Returns name, email, role, pending status, and MFA status.',
  summary: 'Get member details by ID',
  icon: 'user',
  group: 'Members',
  input: z.object({
    account_slug: z.string().describe('The account slug the member belongs to'),
    member_id: z.string().describe('The member ID to retrieve'),
  }),
  output: memberSchema,
  handle: async params => {
    const raw = await api<RawMember>(`/${params.account_slug}/members/${params.member_id}`);
    return mapMember(raw);
  },
});
