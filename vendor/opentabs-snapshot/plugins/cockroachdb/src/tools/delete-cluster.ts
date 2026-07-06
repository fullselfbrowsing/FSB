import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const deleteCluster = defineTool({
  name: 'delete_cluster',
  displayName: 'Delete Cluster',
  description:
    'Delete a CockroachDB cluster. This action is irreversible. The cluster must not have delete protection enabled.',
  summary: 'Delete a cluster',
  icon: 'trash-2',
  group: 'Clusters',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the deletion was initiated') }),
  handle: async params => {
    const p = getConsoleProto();
    await grpc('DeleteCluster', p.DeleteClusterResponse, () => {
      const req = newRequest('DeleteClusterRequest');
      setField(req, 'setClusterId', params.cluster_id);
      return req;
    });
    return { success: true };
  },
});
