import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawVariableSet } from './schemas.js';
import { mapVariableSet, variableSetSchema } from './schemas.js';

export const getVariableSet = defineTool({
  name: 'get_variable_set',
  displayName: 'Get Variable Set',
  description: 'Get detailed information about a variable set.',
  summary: 'Get variable set details',
  icon: 'list',
  group: 'Variable Sets',
  input: z.object({
    varset_id: z.string().describe('Variable set ID (e.g., "varset-...")'),
  }),
  output: z.object({
    variable_set: variableSetSchema.describe('Variable set details'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawVariableSet>>(`/varsets/${encodeURIComponent(params.varset_id)}`);
    return {
      variable_set: mapVariableSet(res.data.id, res.data.attributes),
    };
  },
});
