import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapMergeRequest, mergeRequestSchema } from './schemas.js';

export const getMergeRequest = defineTool({
  name: 'get_merge_request',
  displayName: 'Get Merge Request',
  description: 'Get detailed information about a specific merge request.',
  summary: 'Get merge request details',
  icon: 'git-pull-request',
  group: 'Merge Requests',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    merge_request_iid: z.number().int().min(1).describe('Merge request IID (project-scoped ID)'),
  }),
  output: z.object({
    merge_request: mergeRequestSchema.describe('The merge request'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(
      `/projects/${encodeURIComponent(params.project)}/merge_requests/${params.merge_request_iid}`,
    );
    return { merge_request: mapMergeRequest(data) };
  },
});
