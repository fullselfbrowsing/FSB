// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../vercel-api.js';

export const getDeployment = defineTool({
  name: 'get_deployment',
  displayName: 'Get Deployment',
  description: 'Get detailed information about a specific Vercel deployment by its ID or URL.',
  summary: 'Get a deployment by ID',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    deployment_id: z.string().min(1).describe('Deployment ID or URL to retrieve'),
    team_id: z.string().optional().describe('Team ID that owns the deployment'),
  }),
  output: z.object({
    uid: z.string().describe('Deployment ID'),
    url: z.string().describe('Deployment URL'),
    readyState: z.string().optional().describe('Deployment ready state'),
  }),
  handle: async (params: { deployment_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v13/deployments/:id (default method).
    const data = await api<{ uid: string; url: string }>(`/v13/deployments/${params.deployment_id}`);
    return data;
  },
});
