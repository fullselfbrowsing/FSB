import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { dependentSchema } from './schemas.js';

interface DependentsResponse {
  dependents?: { dependentsCount?: string; dependentsTruncated?: string[] };
}

export const get_package_dependents = defineTool({
  name: 'get_package_dependents',
  displayName: 'Get Package Dependents',
  description:
    'Get packages that depend on this package. Returns the total count and a sample list of dependent package names.',
  summary: 'Get packages depending on a package',
  icon: 'git-fork',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express")'),
  }),
  output: z.object({
    count: z.string().describe('Total number of dependent packages'),
    dependents: z.array(dependentSchema).describe('Sample of dependent package names'),
  }),
  handle: async params => {
    const data = await spiferack<DependentsResponse>(`/package/${params.name}`);
    const deps = data.dependents;
    return {
      count: deps?.dependentsCount ?? '0',
      dependents: (deps?.dependentsTruncated ?? []).map(name => ({ name })),
    };
  },
});
