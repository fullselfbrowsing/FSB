import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getFromCache } from '../clickhouse-api.js';
import type { RawService } from './schemas.js';
import { mapService, serviceSchema } from './schemas.js';

export const getService = defineTool({
  name: 'get_service',
  displayName: 'Get Service',
  description:
    'Get detailed information about a specific ClickHouse Cloud service including state, endpoints, scaling, and IP access list.',
  summary: 'Get service details',
  icon: 'server',
  group: 'Services',
  input: z.object({
    service_id: z.string().describe('Service UUID'),
  }),
  output: z.object({
    service: serviceSchema,
  }),
  handle: async params => {
    const instances = getFromCache<RawService[]>('instances');
    if (!instances) throw ToolError.notFound('Service data not found in cache — please reload the console.');

    const service = instances.find(i => i.id === params.service_id);
    if (!service) throw ToolError.notFound(`Service ${params.service_id} not found.`);

    return { service: mapService(service) };
  },
});
