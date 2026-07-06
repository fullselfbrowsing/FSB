import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawCluster, clusterSchema, mapCluster } from './schemas.js';

export const getCluster = defineTool({
  name: 'get_cluster',
  displayName: 'Get Cluster',
  description:
    'Get detailed information about a specific MongoDB Atlas cluster by name, including state, version, provider, connection string, and disk size.',
  summary: 'Get cluster details by name',
  icon: 'database',
  group: 'Clusters',
  input: z.object({
    cluster_name: z.string().describe('Cluster name to retrieve'),
  }),
  output: z.object({ cluster: clusterSchema.describe('The cluster') }),
  handle: async params => {
    const groupId = getGroupId();
    const raw = await api<RawCluster>(`/nds/clusters/${groupId}/${params.cluster_name}`);
    return { cluster: mapCluster(raw) };
  },
});
