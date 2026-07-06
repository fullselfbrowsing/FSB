import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';

export const getResourceCount = defineTool({
  name: 'get_resource_count',
  displayName: 'Get Resource Count',
  description:
    'Get a count of clusters and folders in the organization, broken down by serverless vs dedicated and authorized vs total.',
  summary: 'Get cluster and folder counts',
  icon: 'hash',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    serverless_clusters: z.number().int().describe('Number of serverless clusters'),
    dedicated_clusters: z.number().int().describe('Number of dedicated clusters'),
    folders: z.number().int().describe('Number of folders'),
  }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<{
      totalServerlessClusters?: number;
      totalDedicatedClusters?: number;
      totalFolders?: number;
    }>('GetResourceCount', p.GetResourceCountResponse);
    return {
      serverless_clusters: data.totalServerlessClusters ?? 0,
      dedicated_clusters: data.totalDedicatedClusters ?? 0,
      folders: data.totalFolders ?? 0,
    };
  },
});
