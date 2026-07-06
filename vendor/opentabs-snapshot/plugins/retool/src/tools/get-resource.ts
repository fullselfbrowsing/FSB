import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const getResource = defineTool({
  name: 'get_resource',
  displayName: 'Get Resource',
  description:
    'Get full details of a single resource (data source) by ID. Returns connection configuration, environment settings, and metadata. Use list_resources to find resource IDs.',
  summary: 'Get resource details by ID',
  icon: 'database',
  group: 'Resources',
  input: z.object({
    resource_id: z.number().describe('Resource ID (from list_resources)'),
  }),
  output: z.object({
    id: z.number().describe('Resource ID'),
    uuid: z.string().describe('Resource UUID'),
    display_name: z.string().describe('Display name'),
    type: z.string().describe('Resource type'),
    editor_type: z.string().describe('Editor type for queries'),
    host: z.string().describe('Connection host'),
    port: z.string().describe('Connection port'),
    database_name: z.string().describe('Database name (for DB resources)'),
    options: z.record(z.string(), z.unknown()).describe('Full configuration options'),
  }),
  handle: async params => {
    const resResp = await api<{ resources: Array<Record<string, unknown>> }>('/api/resources');
    const resource = resResp.resources.find((r: Record<string, unknown>) => r.id === params.resource_id);
    if (!resource) throw ToolError.notFound(`Resource with ID ${params.resource_id} not found`);

    const envs = resource.environments as Record<string, Record<string, unknown>> | undefined;
    const env = envs ? Object.values(envs)[0] : null;

    return {
      id: (resource.id as number) ?? 0,
      uuid: (resource.uuid as string) ?? '',
      display_name: (resource.displayName as string) ?? '',
      type: (resource.type as string) ?? '',
      editor_type: (resource.editorType as string) ?? '',
      host: (env?.host as string) ?? '',
      port: (env?.port as string) ?? '',
      database_name: (env?.databaseName as string) ?? '',
      options: (env?.options as Record<string, unknown>) ?? {},
    };
  },
});
