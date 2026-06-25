import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapMergeRequest, mergeRequestSchema } from './schemas.js';

export const updateMergeRequest = defineTool({
  name: 'update_merge_request',
  displayName: 'Update Merge Request',
  description: 'Update an existing merge request. Only specified fields are changed.',
  summary: 'Update a merge request',
  icon: 'pencil',
  group: 'Merge Requests',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    merge_request_iid: z.number().int().min(1).describe('Merge request IID (project-scoped ID)'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description in Markdown'),
    state_event: z.enum(['close', 'reopen']).optional().describe('Transition the MR state'),
    labels: z.string().optional().describe('Comma-separated list of label names (replaces existing)'),
    assignee_id: z.number().optional().describe('User ID to assign'),
    target_branch: z.string().optional().describe('New target branch'),
    remove_source_branch: z.boolean().optional().describe('Delete source branch after merge'),
    squash: z.boolean().optional().describe('Squash commits when merging'),
  }),
  output: z.object({
    merge_request: mergeRequestSchema.describe('The updated merge request'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.title !== undefined) body.title = params.title;
    if (params.description !== undefined) body.description = params.description;
    if (params.state_event !== undefined) body.state_event = params.state_event;
    if (params.labels !== undefined) body.labels = params.labels;
    if (params.assignee_id !== undefined) body.assignee_id = params.assignee_id;
    if (params.target_branch !== undefined) body.target_branch = params.target_branch;
    if (params.remove_source_branch !== undefined) body.remove_source_branch = params.remove_source_branch;
    if (params.squash !== undefined) body.squash = params.squash;

    const data = await api<Record<string, unknown>>(
      `/projects/${encodeURIComponent(params.project)}/merge_requests/${params.merge_request_iid}`,
      { method: 'PUT', body },
    );
    return { merge_request: mapMergeRequest(data) };
  },
});
