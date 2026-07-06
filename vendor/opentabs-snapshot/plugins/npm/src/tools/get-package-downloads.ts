import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { downloadStatSchema, mapDownloadStat } from './schemas.js';
import type { RawDownloadStat } from './schemas.js';

interface DownloadsResponse {
  downloads?: RawDownloadStat[];
}

export const get_package_downloads = defineTool({
  name: 'get_package_downloads',
  displayName: 'Get Package Downloads',
  description:
    'Get weekly download statistics for an npm package over the past year. Returns an array of weekly download counts.',
  summary: 'Get download stats for a package',
  icon: 'download',
  group: 'Packages',
  input: z.object({
    name: z.string().describe('Package name (e.g., "express")'),
  }),
  output: z.object({
    name: z.string().describe('Package name'),
    downloads: z.array(downloadStatSchema).describe('Weekly download counts for the past year'),
  }),
  handle: async params => {
    const data = await spiferack<DownloadsResponse>(`/package/${params.name}`);
    return {
      name: params.name,
      downloads: (data.downloads ?? []).map(mapDownloadStat),
    };
  },
});
