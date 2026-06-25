import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';

interface ReadmeResponse {
  readme?: string | { data?: string };
  packageVersion?: { name?: string; version?: string };
}

const extractReadme = (readme: string | { data?: string } | undefined): string => {
  if (!readme) return '';
  if (typeof readme === 'string') return readme;
  return readme.data ?? '';
};

export const get_package_readme = defineTool({
  name: 'get_package_readme',
  displayName: 'Get Package README',
  description: 'Get the README content of an npm package. Returns the full README as rendered on the package page.',
  summary: 'Get the README of a package',
  icon: 'file-text',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express")'),
  }),
  output: z.object({
    name: z.string().describe('Package name'),
    version: z.string().describe('Version the README belongs to'),
    readme: z.string().describe('README content (HTML)'),
  }),
  handle: async params => {
    const data = await spiferack<ReadmeResponse>(`/package/${params.name}`);
    return {
      name: data.packageVersion?.name ?? params.name,
      version: data.packageVersion?.version ?? '',
      readme: extractReadme(data.readme),
    };
  },
});
