import { z } from 'zod';
import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { variableSchema, mapVariable } from './schemas.js';
import type { RawVariable } from './schemas.js';

export const updateVariable = defineTool({
  name: 'update_variable',
  displayName: 'Update Variable',
  description: 'Update a workspace variable. Only specified fields are changed.',
  summary: 'Update a workspace variable',
  icon: 'pencil',
  group: 'Variables',
  input: z.object({
    variable_id: z.string().describe('Variable ID (e.g., "var-...")'),
    key: z.string().optional().describe('New variable key name'),
    value: z.string().optional().describe('New variable value'),
    description: z.string().optional().describe('New variable description'),
    hcl: z.boolean().optional().describe('Whether the value is HCL'),
    sensitive: z.boolean().optional().describe('Whether the variable is sensitive'),
  }),
  output: z.object({
    variable: variableSchema,
  }),
  handle: async params => {
    const attributes = stripUndefined({
      key: params.key,
      value: params.value,
      description: params.description,
      hcl: params.hcl,
      sensitive: params.sensitive,
    });

    const data = await api<JsonApiResponse<RawVariable>>(`/vars/${encodeURIComponent(params.variable_id)}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'vars',
          id: params.variable_id,
          attributes,
        },
      },
    });

    return {
      variable: mapVariable(data.data.id, data.data.attributes),
    };
  },
});
