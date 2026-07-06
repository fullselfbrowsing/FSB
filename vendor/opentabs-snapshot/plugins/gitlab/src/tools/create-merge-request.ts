import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapMergeRequest, mergeRequestSchema } from './schemas.js';

export const createMergeRequest = defineTool({
  name: 'create_merge_request',
  displayName: 'Create Merge Request',
  description: 'Create a new merge request in a project.',
  summary: 'Create a new merge request',
  icon: 'git-pull-request-arrow',
  group: 'Merge Requests',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    title: z.string().min(1).describe('Merge request title'),
    source_branch: z.string().min(1).describe('Source branch name'),
    target_branch: z.string().min(1).describe('Target branch name'),
    description: z.string().optional().describe('MR description in Markdown'),
    labels: z.string().optional().describe('Comma-separated list of label names'),
    assignee_id: z.number().optional().describe('User ID to assign'),
    milestone_id: z.number().optional().describe('Milestone ID'),
    remove_source_branch: z.boolean().optional().describe('Delete source branch after merge'),
    squash: z.boolean().optional().describe('Squash commits when merging'),
  }),
  output: z.object({
    merge_request: mergeRequestSchema.describe('The created merge request'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      title: params.title,
      source_branch: params.source_branch,
      target_branch: params.target_branch,
    };
    if (params.description !== undefined) body.description = params.description;
    if (params.labels !== undefined) body.labels = params.labels;
    if (params.assignee_id !== undefined) body.assignee_id = params.assignee_id;
    if (params.milestone_id !== undefined) body.milestone_id = params.milestone_id;
    if (params.remove_source_branch !== undefined) body.remove_source_branch = params.remove_source_branch;
    if (params.squash !== undefined) body.squash = params.squash;

    const data = await api<Record<string, unknown>>(`/projects/${encodeURIComponent(params.project)}/merge_requests`, {
      method: 'POST',
      body,
    });
    return { merge_request: mapMergeRequest(data) };
  },
});
