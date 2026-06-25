import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawResource, mapResource, resourceSchema } from './schemas.js';

export const getResource = defineTool({
  name: 'get_resource',
  displayName: 'Get Resource',
  description:
    'Get detailed information about a specific Azure resource by its full resource ID. The resource ID follows the format: /subscriptions/{sub}/resourceGroups/{rg}/providers/{provider}/{type}/{name}.',
  summary: 'Get a resource by ID',
  icon: 'box',
  group: 'Resources',
  input: z.object({
    resource_id: z
      .string()
      .describe(
        'Full resource ID (e.g., /subscriptions/.../resourceGroups/.../providers/Microsoft.Compute/virtualMachines/myVM)',
      ),
    api_version: z.string().optional().describe('API version for the resource provider (default: 2021-04-01)'),
  }),
  output: z.object({ resource: resourceSchema }),
  handle: async params => {
    const data = await armApi<RawResource>(params.resource_id, {
      apiVersion: params.api_version ?? '2021-04-01',
    });
    return { resource: mapResource(data) };
  },
});
