import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack, getUsername } from '../npm-api.js';
import { userPackageSchema, mapUserPackage } from './schemas.js';
import type { RawUserPackage } from './schemas.js';

interface SettingsPackagesResponse {
  packages?: { objects?: RawUserPackage[]; total?: number };
  packagesCounts?: { all?: number; linked?: number; unlinked?: number };
}

export const list_user_packages = defineTool({
  name: 'list_user_packages',
  displayName: 'List My Packages',
  description:
    "List the authenticated user's own packages from the settings page. Includes both public and private packages. Requires authentication.",
  summary: 'List your own packages',
  icon: 'package',
  group: 'Settings',
  input: z.object({
    page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  }),
  output: z.object({
    packages: z.array(userPackageSchema).describe('Your packages'),
    total: z.number().describe('Total number of your packages'),
  }),
  handle: async params => {
    const username = getUsername();
    const page = params.page ?? 0;
    const data = await spiferack<SettingsPackagesResponse>(`/settings/${username}/packages`, {
      query: { page },
    });
    return {
      packages: (data.packages?.objects ?? []).map(mapUserPackage),
      total: data.packages?.total ?? 0,
    };
  },
});
