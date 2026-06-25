// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../vercel-api.js';

export const listDeployments = defineTool({
  name: 'list_deployments',
  displayName: 'List Deployments',
  description: 'List recent deployments for a Vercel project or team. Optionally filter by project, target, or state.',
  summary: 'List deployments',
  icon: 'list',
  group: 'Deployments',
  input: z.object({
    project_id: z.string().optional().describe('Project ID or name to scope deployments to'),
    team_id: z.string().optional().describe('Team ID that owns the deployments'),
    target: z.enum(['production', 'preview']).optional().describe('Filter by deployment target'),
    state: z.enum(['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED']).optional().describe('Filter by deployment state'),
    limit: z.number().int().optional().describe('Maximum number of deployments to return'),
  }),
  output: z.object({
    deployments: z
      .array(z.object({ uid: z.string(), url: z.string() }))
      .describe('List of deployments'),
  }),
  handle: async (_params: { project_id?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v6/deployments (default method).
    const data = await api<{ deployments: Array<{ uid: string; url: string }> }>(`/v6/deployments`);
    return data;
  },
});
