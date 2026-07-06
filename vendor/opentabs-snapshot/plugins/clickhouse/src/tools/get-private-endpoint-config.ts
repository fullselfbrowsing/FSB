import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../clickhouse-api.js';

const privateEndpointConfigSchema = z.object({
  endpoint_service_id: z.string().describe('Cloud provider service attachment or endpoint service ID'),
  private_dns_hostname: z.string().describe('Private DNS hostname for connecting via private endpoint'),
});

interface RawPrivateEndpointConfig {
  endpointServiceId?: string;
  privateDnsHostname?: string;
}

export const getPrivateEndpointConfig = defineTool({
  name: 'get_private_endpoint_config',
  displayName: 'Get Private Endpoint Config',
  description:
    'Get the private endpoint configuration for a ClickHouse Cloud service. Returns the cloud provider endpoint service ID and private DNS hostname needed to set up private connectivity.',
  summary: 'Get private endpoint configuration',
  icon: 'lock',
  group: 'Services',
  input: z.object({
    service_id: z.string().describe('Service UUID'),
  }),
  output: z.object({
    config: privateEndpointConfigSchema,
  }),
  handle: async params => {
    const orgId = getOrgId();
    if (!orgId) throw ToolError.auth('No organization selected — please open ClickHouse Cloud console.');

    const data = await api<RawPrivateEndpointConfig>('/api/instance', {
      body: {
        rpcAction: 'getPrivateEndpointConfig',
        organizationId: orgId,
        instanceId: params.service_id,
      },
    });

    return {
      config: {
        endpoint_service_id: data.endpointServiceId ?? '',
        private_dns_hostname: data.privateDnsHostname ?? '',
      },
    };
  },
});
