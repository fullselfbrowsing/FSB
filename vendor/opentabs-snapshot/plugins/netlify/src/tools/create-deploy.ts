// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const createDeploy = defineTool({
  name: 'create_deploy',
  displayName: 'Create Deploy',
  description:
    'Trigger a new deploy for a Netlify site. Requires a site_id; optionally set the deploy title and target branch.',
  summary: 'Trigger a new deploy',
  icon: 'cloud-upload',
  group: 'Deploys',
  input: z.object({
    site_id: z.string().min(1).describe('Site ID to deploy'),
    title: z.string().optional().describe('Deploy title'),
    branch: z.string().optional().describe('Git branch to deploy'),
    clear_cache: z.boolean().optional().describe('Clear the build cache before deploying'),
  }),
  output: z.object({
    id: z.string().describe('The created deploy ID'),
    state: z.string().describe('The created deploy state'),
  }),
  handle: async (params: { site_id: string }) => {
    // NEVER executed by the importer. Upstream: api POST /sites/:site_id/deploys.
    const data = await api<{ id: string; state: string }>(`/sites/${params.site_id}/deploys`, {
      method: 'POST',
      body: { title: 'deploy' },
    });
    return data;
  },
});
