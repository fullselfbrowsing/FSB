import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawVariableSet } from './schemas.js';
import { mapVariableSet, variableSetSchema } from './schemas.js';

export const createVariableSet = defineTool({
  name: 'create_variable_set',
  displayName: 'Create Variable Set',
  description: 'Create a new variable set in an organization. Set global to true to apply to all workspaces.',
  summary: 'Create a variable set',
  icon: 'plus',
  group: 'Variable Sets',
  input: z.object({
    organization: z.string().describe('Organization name'),
    name: z.string().describe('Variable set name'),
    description: z.string().optional().describe('Variable set description'),
    global: z.boolean().optional().describe('Whether to apply to all workspaces (default false)'),
    priority: z
      .boolean()
      .optional()
      .describe('Whether this set takes priority over workspace variables (default false)'),
  }),
  output: z.object({
    variable_set: variableSetSchema.describe('Created variable set'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawVariableSet>>(
      `/organizations/${encodeURIComponent(params.organization)}/varsets`,
      {
        method: 'POST',
        body: {
          data: {
            type: 'varsets',
            attributes: {
              name: params.name,
              description: params.description,
              global: params.global,
              priority: params.priority,
            },
          },
        },
      },
    );
    return {
      variable_set: mapVariableSet(res.data.id, res.data.attributes),
    };
  },
});
