import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { clusterSchema, mapCluster } from './schemas.js';
import type { RawCluster } from './schemas.js';

export const getCluster = defineTool({
  name: 'get_cluster',
  displayName: 'Get GKE Cluster',
  description: 'Get detailed information about a specific GKE cluster.',
  summary: 'Get a GKE cluster',
  icon: 'container',
  group: 'Kubernetes',
  input: z.object({
    location: z.string().describe('Location (zone or region, e.g., "us-central1-a")'),
    cluster_name: z.string().describe('Cluster name'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ cluster: clusterSchema }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawCluster>(
      `https://container.googleapis.com/v1/projects/${projectId}/locations/${params.location}/clusters/${params.cluster_name}`,
    );
    return { cluster: mapCluster(data) };
  },
});
