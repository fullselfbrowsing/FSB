import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { clusterSchema, mapCluster } from './schemas.js';
import type { RawCluster } from './schemas.js';

export const listClusters = defineTool({
  name: 'list_clusters',
  displayName: 'List GKE Clusters',
  description: 'List Google Kubernetes Engine (GKE) clusters in the project across all locations.',
  summary: 'List GKE clusters',
  icon: 'container',
  group: 'Kubernetes',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({
    clusters: z.array(clusterSchema).describe('List of GKE clusters'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ clusters?: RawCluster[] }>(
      `https://container.googleapis.com/v1/projects/${projectId}/locations/-/clusters`,
    );
    return { clusters: (data.clusters ?? []).map(mapCluster) };
  },
});
