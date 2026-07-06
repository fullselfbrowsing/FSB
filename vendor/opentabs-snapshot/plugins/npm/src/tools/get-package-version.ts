import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { packageSchema, mapPackage, dependencySchema, mapDependencies } from './schemas.js';
import type { RawPackagePage } from './schemas.js';

export const get_package_version = defineTool({
  name: 'get_package_version',
  displayName: 'Get Package Version',
  description:
    'Get detailed information about a specific version of an npm package, including dependencies and dev dependencies for that version.',
  summary: 'Get details for a specific package version',
  icon: 'tag',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express")'),
    version: z.string().describe('Version number (e.g., "5.2.1")'),
  }),
  output: z.object({
    package: packageSchema,
    dependencies: z.array(dependencySchema).describe('Runtime dependencies'),
    dev_dependencies: z.array(dependencySchema).describe('Development dependencies'),
  }),
  handle: async params => {
    const data = await spiferack<RawPackagePage>(`/package/${params.name}/v/${params.version}`);
    return {
      package: mapPackage(data),
      dependencies: mapDependencies(data.packageVersion?.dependencies),
      dev_dependencies: mapDependencies(data.packageVersion?.devDependencies),
    };
  },
});
