import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawIpAccessEntry, ipAccessEntrySchema, mapIpAccessEntry } from './schemas.js';

export const addIpAccessEntry = defineTool({
  name: 'add_ip_access_entry',
  displayName: 'Add IP Access Entry',
  description:
    'Add an IP address or CIDR block to the access list for the current MongoDB Atlas project, allowing network access from that address.',
  summary: 'Add an IP to the access list',
  icon: 'shield-plus',
  group: 'Network Access',
  input: z.object({
    ip_address: z.string().describe('IP address or CIDR block to allow (e.g., "192.168.1.0/24")'),
    comment: z.string().optional().describe('Optional description for this entry'),
  }),
  output: z.object({
    entry: ipAccessEntrySchema.describe('The created IP access list entry'),
  }),
  handle: async params => {
    const groupId = getGroupId();
    const body = [
      {
        ipAddress: params.ip_address,
        comment: params.comment ?? '',
        groupId,
      },
    ];
    const raw = await api<RawIpAccessEntry[]>(`/nds/${groupId}/ipWhitelist`, {
      method: 'POST',
      body,
    });
    return { entry: mapIpAccessEntry((raw ?? [])[0] ?? {}) };
  },
});
