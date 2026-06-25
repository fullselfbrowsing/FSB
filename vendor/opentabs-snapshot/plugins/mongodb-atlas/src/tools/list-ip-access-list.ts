import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawIpAccessEntry, ipAccessEntrySchema, mapIpAccessEntry } from './schemas.js';

export const listIpAccessList = defineTool({
  name: 'list_ip_access_list',
  displayName: 'List IP Access List',
  description: 'List all IP access list entries (IP whitelist) for the current MongoDB Atlas project.',
  summary: 'List IP access list entries',
  icon: 'shield',
  group: 'Network Access',
  input: z.object({}),
  output: z.object({
    entries: z.array(ipAccessEntrySchema).describe('IP access list entries'),
  }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawIpAccessEntry[]>(`/nds/${groupId}/ipWhitelist`);
    return { entries: (raw ?? []).map(mapIpAccessEntry) };
  },
});
