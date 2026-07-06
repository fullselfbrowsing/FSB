import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';

export const startInstance = defineTool({
  name: 'start_instance',
  displayName: 'Start Instance',
  description: 'Start a stopped Compute Engine VM instance. The instance must be in TERMINATED or STOPPED state.',
  summary: 'Start a stopped VM instance',
  icon: 'play',
  group: 'Compute',
  input: z.object({
    zone: z.string().describe('Zone (e.g., "us-central1-a")'),
    instance_name: z.string().describe('Instance name'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation was initiated') }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    await gcpApi(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${params.zone}/instances/${params.instance_name}/start`,
      { method: 'POST' },
    );
    return { success: true };
  },
});
