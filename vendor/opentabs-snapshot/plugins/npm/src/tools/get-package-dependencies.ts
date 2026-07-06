import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { dependencySchema, mapDependencies } from './schemas.js';

interface DepsResponse {
  packageVersion?: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

export const get_package_dependencies = defineTool({
  name: 'get_package_dependencies',
  displayName: 'Get Package Dependencies',
  description: 'Get the runtime and development dependencies of the latest version of an npm package.',
  summary: 'Get dependencies of a package',
  icon: 'network',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express")'),
  }),
  output: z.object({
    name: z.string().describe('Package name'),
    version: z.string().describe('Version the dependencies are for'),
    dependencies: z.array(dependencySchema).describe('Runtime dependencies'),
    dev_dependencies: z.array(dependencySchema).describe('Development dependencies'),
  }),
  handle: async params => {
    const data = await spiferack<DepsResponse>(`/package/${params.name}`);
    const pv = data.packageVersion;
    return {
      name: pv?.name ?? params.name,
      version: pv?.version ?? '',
      dependencies: mapDependencies(pv?.dependencies),
      dev_dependencies: mapDependencies(pv?.devDependencies),
    };
  },
});
