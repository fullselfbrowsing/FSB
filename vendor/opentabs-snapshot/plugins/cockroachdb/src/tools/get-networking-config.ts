import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const getNetworkingConfig = defineTool({
  name: 'get_networking_config',
  displayName: 'Get Networking Config',
  description:
    'Get the networking configuration for a cluster including IP allowlist entries and private endpoint settings.',
  summary: 'Get cluster networking configuration',
  icon: 'network',
  group: 'Networking',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({
    config: z.record(z.string(), z.unknown()).describe('Networking configuration details'),
  }),
  handle: async params => {
    const p = getConsoleProto();
    const data = await grpc<Record<string, unknown>>('GetNetworkingConfig', p.GetNetworkingConfigResponse, () => {
      const req = newRequest('GetNetworkingConfigRequest');
      setField(req, 'setClusterId', params.cluster_id);
      return req;
    });
    return { config: data };
  },
});
