import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { organizationSchema, mapOrganization, userPackageSchema, mapUserPackage } from './schemas.js';
import type { RawOrgPage, RawUserPackage } from './schemas.js';

interface OrgResponse extends RawOrgPage {
  packages?: { total?: number; objects?: RawUserPackage[] };
}

export const get_organization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description:
    'Get information about an npm organization including name, description, creation date, packages, and 2FA enforcement.',
  summary: 'Get npm organization details',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    name: z.string().describe('Organization name (e.g., "babel")'),
    page: z.number().int().min(0).optional().describe('Page number for packages pagination (default 0)'),
  }),
  output: z.object({
    organization: organizationSchema,
    packages: z.array(userPackageSchema).describe('Organization packages'),
  }),
  handle: async params => {
    const page = params.page ?? 0;
    const data = await spiferack<OrgResponse>(`/org/${params.name}`, {
      query: { page },
    });
    return {
      organization: mapOrganization(data),
      packages: (data.packages?.objects ?? []).map(mapUserPackage),
    };
  },
});
