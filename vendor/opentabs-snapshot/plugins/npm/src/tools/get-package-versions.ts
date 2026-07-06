import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { versionInfoSchema } from './schemas.js';

interface PackumentVersion {
  version?: string;
  deprecated?: string;
  date?: { ts?: number; rel?: string };
}

interface VersionsResponse {
  packument?: {
    versions?: PackumentVersion[];
    'dist-tags'?: Record<string, string>;
  };
  capsule?: { 'dist-tags'?: Record<string, string> };
}

export const get_package_versions = defineTool({
  name: 'get_package_versions',
  displayName: 'Get Package Versions',
  description:
    'Get all published versions of an npm package with deprecation status and dist-tags. Uses the versions tab for full data.',
  summary: 'List all versions of a package',
  icon: 'list-ordered',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express")'),
  }),
  output: z.object({
    name: z.string().describe('Package name'),
    dist_tags: z.record(z.string(), z.string()).describe('Dist-tags mapping'),
    versions: z.array(versionInfoSchema).describe('All published versions (newest first)'),
  }),
  handle: async params => {
    const data = await spiferack<VersionsResponse>(`/package/${params.name}`, { query: { activeTab: 'versions' } });
    const packumentVersions = data.packument?.versions ?? [];
    return {
      name: params.name,
      dist_tags: data.capsule?.['dist-tags'] ?? data.packument?.['dist-tags'] ?? {},
      versions: packumentVersions.map(v => ({
        version: v.version ?? '',
        deprecated: v.deprecated ?? '',
      })),
    };
  },
});
