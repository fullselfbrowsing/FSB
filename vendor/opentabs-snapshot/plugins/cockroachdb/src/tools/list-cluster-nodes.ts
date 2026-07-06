import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const listClusterNodes = defineTool({
  name: 'list_cluster_nodes',
  displayName: 'List Cluster Nodes',
  description: 'List all nodes in a CockroachDB cluster with their status, region, and liveness information.',
  summary: 'List nodes in a cluster',
  icon: 'server',
  group: 'Clusters',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({
    nodes: z.array(z.record(z.string(), z.unknown())).describe('List of cluster nodes with status details'),
  }),
  handle: async params => {
    const p = getConsoleProto();
    const data = await grpc<{ nodesList?: Record<string, unknown>[] }>(
      'ListClusterNodes',
      p.ListClusterNodesResponse,
      () => {
        const req = newRequest('ListClusterNodesRequest');
        setField(req, 'setClusterId', params.cluster_id);
        return req;
      },
    );
    return { nodes: data.nodesList ?? [] };
  },
});
