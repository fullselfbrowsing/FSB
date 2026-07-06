import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';
import type { RawCluster } from './schemas.js';
import { clusterDetailSchema, mapClusterDetail } from './schemas.js';

export const getCluster = defineTool({
  name: 'get_cluster',
  displayName: 'Get Cluster',
  description:
    'Get detailed information about a specific CockroachDB cluster including regions, usage limits, billing plan, and connection endpoints.',
  summary: 'Get cluster details by ID',
  icon: 'database',
  group: 'Clusters',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({ cluster: clusterDetailSchema }),
  handle: async params => {
    const p = getConsoleProto();
    const data = await grpc<{ cluster?: RawCluster }>('GetCluster', p.GetClusterResponse, () => {
      const req = newRequest('GetClusterRequest');
      setField(req, 'setClusterId', params.cluster_id);
      return req;
    });
    return { cluster: mapClusterDetail(data.cluster ?? {}) };
  },
});
