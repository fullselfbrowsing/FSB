import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { billingInfoSchema, mapBillingInfo } from './schemas.js';
import type { RawBillingInfo } from './schemas.js';

export const getBillingInfo = defineTool({
  name: 'get_billing_info',
  displayName: 'Get Billing Info',
  description:
    'Get billing information for a project, including whether billing is enabled and which billing account is linked.',
  summary: 'Get project billing info',
  icon: 'receipt',
  group: 'Billing',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ billing_info: billingInfoSchema }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawBillingInfo>(
      `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`,
    );
    return { billing_info: mapBillingInfo(data) };
  },
});
