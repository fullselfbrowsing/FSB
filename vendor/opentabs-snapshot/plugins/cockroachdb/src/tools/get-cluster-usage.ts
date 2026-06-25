import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';
import { usageSchema } from './schemas.js';

export const getClusterUsage = defineTool({
  name: 'get_cluster_usage',
  displayName: 'Get Cluster Usage',
  description: 'Get current usage metrics for a cluster including consumed request units and storage usage in GiB.',
  summary: 'Get cluster usage metrics',
  icon: 'bar-chart-3',
  group: 'Clusters',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({ usage: usageSchema }),
  handle: async params => {
    const p = getConsoleProto();
    const data = await grpc<{ consumedRequestUnits?: number; currentStorageGib?: number }>(
      'GetClusterUsage',
      p.GetClusterUsageResponse,
      () => {
        const req = newRequest('GetClusterUsageRequest');
        setField(req, 'setClusterId', params.cluster_id);
        return req;
      },
    );
    return {
      usage: {
        consumed_request_units: data.consumedRequestUnits ?? 0,
        current_storage_gib: data.currentStorageGib ?? 0,
      },
    };
  },
});
