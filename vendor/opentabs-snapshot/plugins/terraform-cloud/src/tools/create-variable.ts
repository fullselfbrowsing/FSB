import { z } from 'zod';
import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { variableSchema, mapVariable } from './schemas.js';
import type { RawVariable } from './schemas.js';

export const createVariable = defineTool({
  name: 'create_variable',
  displayName: 'Create Variable',
  description:
    'Create a new variable in a workspace. Set category to "terraform" for Terraform variables or "env" for environment variables.',
  summary: 'Create a workspace variable',
  icon: 'plus',
  group: 'Variables',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
    key: z.string().describe('Variable key name'),
    value: z.string().optional().describe('Variable value'),
    category: z.enum(['terraform', 'env']).describe('Variable category: "terraform" or "env"'),
    description: z.string().optional().describe('Variable description'),
    hcl: z.boolean().optional().describe('Whether the value is HCL (default false)'),
    sensitive: z.boolean().optional().describe('Whether the variable is sensitive (default false)'),
  }),
  output: z.object({
    variable: variableSchema,
  }),
  handle: async params => {
    const attributes = stripUndefined({
      key: params.key,
      category: params.category,
      value: params.value,
      description: params.description,
      hcl: params.hcl,
      sensitive: params.sensitive,
    });

    const data = await api<JsonApiResponse<RawVariable>>(
      `/workspaces/${encodeURIComponent(params.workspace_id)}/vars`,
      {
        method: 'POST',
        body: {
          data: {
            type: 'vars',
            attributes,
          },
        },
      },
    );

    return {
      variable: mapVariable(data.data.id, data.data.attributes),
    };
  },
});
