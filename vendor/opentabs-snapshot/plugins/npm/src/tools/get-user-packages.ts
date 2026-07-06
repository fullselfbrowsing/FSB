import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { userPackageSchema, mapUserPackage } from './schemas.js';
import type { RawUserPackage } from './schemas.js';

interface UserPackagesResponse {
  packages?: { objects?: RawUserPackage[]; total?: number };
  pagination?: { perPage?: number; page?: number };
}

export const get_user_packages = defineTool({
  name: 'get_user_packages',
  displayName: 'Get User Packages',
  description:
    'Get the public packages published by an npm user. Returns package names, versions, and descriptions with pagination.',
  summary: 'List packages by a user',
  icon: 'package',
  group: 'Users',
  input: z.object({
    username: z.string().describe('npm username (e.g., "sindresorhus")'),
    page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  }),
  output: z.object({
    packages: z.array(userPackageSchema).describe('User packages'),
    total: z.number().describe('Total number of packages'),
  }),
  handle: async params => {
    const page = params.page ?? 0;
    const data = await spiferack<UserPackagesResponse>(`/~${params.username}`, {
      query: { page },
    });
    return {
      packages: (data.packages?.objects ?? []).map(mapUserPackage),
      total: data.packages?.total ?? 0,
    };
  },
});
