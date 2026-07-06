import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';
import type { RawCluster } from './schemas.js';
import { clusterSchema, mapCluster } from './schemas.js';

export const listClusters = defineTool({
  name: 'list_clusters',
  displayName: 'List Clusters',
  description:
    'List all CockroachDB clusters in the organization. Returns cluster name, state, version, cloud provider, regions, and connection endpoints.',
  summary: 'List all clusters in the organization',
  icon: 'database',
  group: 'Clusters',
  input: z.object({}),
  output: z.object({ clusters: z.array(clusterSchema).describe('List of clusters') }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<{ clustersList?: RawCluster[] }>('ListClusters', p.ListClustersResponse);
    return { clusters: (data.clustersList ?? []).map(mapCluster) };
  },
});
