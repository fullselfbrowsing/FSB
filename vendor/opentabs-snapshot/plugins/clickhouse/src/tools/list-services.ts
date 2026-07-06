import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getFromCache, getOrgId } from '../clickhouse-api.js';
import type { RawService } from './schemas.js';
import { mapService, serviceSchema } from './schemas.js';

interface RawInstance extends RawService {
  organizationId?: string;
}

export const listServices = defineTool({
  name: 'list_services',
  displayName: 'List Services',
  description:
    'List all ClickHouse Cloud services in the current organization. Returns service details including state, endpoints, scaling configuration, and version.',
  summary: 'List all services',
  icon: 'server',
  group: 'Services',
  input: z.object({}),
  output: z.object({
    services: z.array(serviceSchema),
  }),
  handle: async () => {
    const orgId = getOrgId();
    if (!orgId) throw ToolError.auth('No organization selected — please open ClickHouse Cloud console.');

    const instances = getFromCache<RawInstance[]>('instances');
    if (!instances) throw ToolError.notFound('Service data not found in cache — please reload the console.');

    const filtered = instances.filter(i => i.organizationId === orgId);
    return { services: filtered.map(mapService) };
  },
});
