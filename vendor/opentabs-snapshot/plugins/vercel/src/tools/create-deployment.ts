// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../vercel-api.js';

export const createDeployment = defineTool({
  name: 'create_deployment',
  displayName: 'Create Deployment',
  description:
    'Trigger a new Vercel deployment for a project. Requires a project name; optionally set the git source ref and target environment.',
  summary: 'Trigger a new deployment',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    name: z.string().min(1).describe('Project name to deploy'),
    project_id: z.string().optional().describe('Project ID to deploy'),
    team_id: z.string().optional().describe('Team ID that owns the project'),
    target: z.enum(['production', 'preview']).optional().describe('Deployment target environment'),
    git_ref: z.string().optional().describe('Git branch, tag, or commit SHA to deploy'),
  }),
  output: z.object({
    id: z.string().describe('The created deployment ID'),
    url: z.string().describe('The created deployment URL'),
  }),
  handle: async (params: { name: string }) => {
    // NEVER executed by the importer. Upstream: api POST /v13/deployments.
    const data = await api<{ id: string; url: string }>(`/v13/deployments`, {
      method: 'POST',
      body: { name: params.name },
    });
    return data;
  },
});
