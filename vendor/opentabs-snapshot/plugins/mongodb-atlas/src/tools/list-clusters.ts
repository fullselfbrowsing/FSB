import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawCluster, clusterSchema, mapCluster } from './schemas.js';

export const listClusters = defineTool({
  name: 'list_clusters',
  displayName: 'List Clusters',
  description:
    'List all clusters in the current MongoDB Atlas project with their state, provider, region, instance size, and connection strings.',
  summary: 'List clusters in the project',
  icon: 'database',
  group: 'Clusters',
  input: z.object({}),
  output: z.object({ clusters: z.array(clusterSchema).describe('Project clusters') }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawCluster[]>(`/nds/clusters/${groupId}`);
    return { clusters: (raw ?? []).map(mapCluster) };
  },
});
