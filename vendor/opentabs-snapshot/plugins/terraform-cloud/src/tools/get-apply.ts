import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { applySchema, mapApply } from './schemas.js';
import type { RawApply } from './schemas.js';

export const getApply = defineTool({
  name: 'get_apply',
  displayName: 'Get Apply',
  description: 'Get details about an apply including resource changes and status.',
  summary: 'Get apply details',
  icon: 'check-circle',
  group: 'Applies',
  input: z.object({
    apply_id: z.string().describe('Apply ID (e.g., "apply-...")'),
  }),
  output: z.object({
    apply: applySchema,
  }),
  handle: async params => {
    const data = await api<JsonApiResponse<RawApply>>(`/applies/${encodeURIComponent(params.apply_id)}`);

    return {
      apply: mapApply(data.data.id, data.data.attributes),
    };
  },
});
