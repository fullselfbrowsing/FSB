import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { siteSchema, type RawSite, mapSite } from './schemas.js';

export const createSite = defineTool({
  name: 'create_site',
  displayName: 'Create Site',
  description:
    'Create a new Netlify site in the specified account. Provide a site name (used as the subdomain). Returns the created site details.',
  summary: 'Create a new site',
  icon: 'plus',
  group: 'Sites',
  input: z.object({
    account_slug: z.string().describe('The account slug to create the site in'),
    name: z.string().describe('Site name (becomes the subdomain, e.g. "my-app" → my-app.netlify.app)'),
  }),
  output: siteSchema,
  handle: async params => {
    const raw = await api<RawSite>(`/${params.account_slug}/sites`, {
      method: 'POST',
      body: { name: params.name },
    });
    return mapSite(raw);
  },
});
