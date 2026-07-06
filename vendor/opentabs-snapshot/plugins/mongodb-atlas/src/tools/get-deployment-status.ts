import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawDeploymentStatus, deploymentStatusSchema, mapDeploymentStatus } from './schemas.js';

export const getDeploymentStatus = defineTool({
  name: 'get_deployment_status',
  displayName: 'Get Deployment Status',
  description:
    'Get the current deployment status for the MongoDB Atlas project including goal state, version conflicts, draft status, and in-progress jobs.',
  summary: 'Get deployment status',
  icon: 'activity',
  group: 'Deployment',
  input: z.object({}),
  output: z.object({
    status: deploymentStatusSchema.describe('The deployment status'),
  }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawDeploymentStatus>(`/automation/deploymentStatus/${groupId}`);
    return { status: mapDeploymentStatus(raw) };
  },
});
