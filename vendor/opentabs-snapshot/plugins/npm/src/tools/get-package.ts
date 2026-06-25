import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { packageSchema, mapPackage } from './schemas.js';
import type { RawPackagePage } from './schemas.js';

export const get_package = defineTool({
  name: 'get_package',
  displayName: 'Get Package',
  description:
    'Get detailed information about an npm package including version, description, maintainers, dist-tags, download stats, dependencies, and star status. Use the exact package name including scope (e.g., "@types/node").',
  summary: 'Get npm package details',
  icon: 'package',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express", "@types/node")'),
  }),
  output: z.object({
    package: packageSchema,
  }),
  handle: async params => {
    const data = await spiferack<RawPackagePage>(`/package/${params.name}`);
    return { package: mapPackage(data) };
  },
});
