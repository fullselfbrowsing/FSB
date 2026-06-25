import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';

export const deleteIpAccessEntry = defineTool({
  name: 'delete_ip_access_entry',
  displayName: 'Delete IP Access Entry',
  description: 'Remove an IP address or CIDR block from the access list for the current MongoDB Atlas project.',
  summary: 'Remove an IP from the access list',
  icon: 'shield-minus',
  group: 'Network Access',
  input: z.object({
    ip_address: z.string().describe('IP address or CIDR block to remove (e.g., "192.168.1.0/24")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the entry was successfully deleted'),
  }),
  handle: async params => {
    const groupId = getGroupId();
    await api(`/nds/${groupId}/ipWhitelist/${encodeURIComponent(params.ip_address)}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
