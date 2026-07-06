import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawPeering, mapPeering, peeringSchema } from './schemas.js';

export const listNetworkPeering = defineTool({
  name: 'list_network_peering',
  displayName: 'List Network Peering',
  description:
    'List all network peering connections for the current MongoDB Atlas project including provider, status, VPC ID, and CIDR block.',
  summary: 'List network peering connections',
  icon: 'network',
  group: 'Network Access',
  input: z.object({}),
  output: z.object({
    connections: z.array(peeringSchema).describe('Network peering connections'),
  }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawPeering[]>(`/nds/${groupId}/peers`);
    return { connections: (raw ?? []).map(mapPeering) };
  },
});
