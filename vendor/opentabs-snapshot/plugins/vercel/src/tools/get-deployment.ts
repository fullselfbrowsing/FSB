import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { vercelApi } from '../vercel-api.js';
import { deploymentSchema, mapDeployment } from './schemas.js';

export const getDeployment = defineTool({
  name: 'get_deployment',
  displayName: 'Get Deployment',
  description: 'Get detailed information about a specific deployment by its ID or URL.',
  summary: 'Get deployment details',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    deployment_id: z.string().describe('Deployment ID or URL'),
  }),
  output: deploymentSchema,
  handle: async params => {
    const data = await vercelApi<Record<string, unknown>>(
      `/v13/deployments/${encodeURIComponent(params.deployment_id)}`,
    );
    return mapDeployment(data);
  },
});
