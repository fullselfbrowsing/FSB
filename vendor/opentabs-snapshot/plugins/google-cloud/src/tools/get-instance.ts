import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { instanceSchema, mapInstance } from './schemas.js';
import type { RawInstance } from './schemas.js';

export const getInstance = defineTool({
  name: 'get_instance',
  displayName: 'Get Instance',
  description: 'Get detailed information about a specific Compute Engine VM instance.',
  summary: 'Get a Compute Engine VM instance',
  icon: 'server',
  group: 'Compute',
  input: z.object({
    zone: z.string().describe('Zone (e.g., "us-central1-a")'),
    instance_name: z.string().describe('Instance name'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ instance: instanceSchema }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawInstance>(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${params.zone}/instances/${params.instance_name}`,
    );
    return { instance: mapInstance(data) };
  },
});
