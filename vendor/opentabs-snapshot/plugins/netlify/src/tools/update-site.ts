import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { siteSchema, type RawSite, mapSite } from './schemas.js';

export const updateSite = defineTool({
  name: 'update_site',
  displayName: 'Update Site',
  description:
    'Update an existing Netlify site. Supports changing the site name, custom domain, repo branch, build command, and SSL settings. Only provided fields are updated.',
  summary: 'Update site settings',
  icon: 'pencil',
  group: 'Sites',
  input: z.object({
    site_id: z.string().describe('The site ID to update'),
    name: z.string().optional().describe('New site name (subdomain)'),
    custom_domain: z.string().optional().describe('Custom domain name to assign'),
    force_ssl: z.boolean().optional().describe('Whether to enforce HTTPS'),
    repo_branch: z.string().optional().describe('Production branch name'),
    build_cmd: z.string().optional().describe('Build command'),
  }),
  output: siteSchema,
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.custom_domain !== undefined) body.custom_domain = params.custom_domain;
    if (params.force_ssl !== undefined) body.force_ssl = params.force_ssl;
    if (params.repo_branch !== undefined || params.build_cmd !== undefined) {
      body.build_settings = {
        ...(params.repo_branch !== undefined && { repo_branch: params.repo_branch }),
        ...(params.build_cmd !== undefined && { cmd: params.build_cmd }),
      };
    }
    const raw = await api<RawSite>(`/sites/${params.site_id}`, {
      method: 'PATCH',
      body,
    });
    return mapSite(raw);
  },
});
