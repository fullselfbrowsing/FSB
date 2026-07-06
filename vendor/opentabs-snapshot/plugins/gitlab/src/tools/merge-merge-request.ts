import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapMergeRequest, mergeRequestSchema } from './schemas.js';

export const mergeMergeRequest = defineTool({
  name: 'merge_merge_request',
  displayName: 'Merge a Merge Request',
  description: 'Accept and merge a merge request. Optionally squash commits or delete the source branch.',
  summary: 'Merge a merge request',
  icon: 'git-merge',
  group: 'Merge Requests',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    merge_request_iid: z.number().int().min(1).describe('Merge request IID (project-scoped ID)'),
    merge_commit_message: z.string().optional().describe('Custom merge commit message'),
    squash_commit_message: z.string().optional().describe('Custom squash commit message'),
    squash: z.boolean().optional().describe('Squash commits when merging'),
    should_remove_source_branch: z.boolean().optional().describe('Delete source branch after merge'),
  }),
  output: z.object({
    merge_request: mergeRequestSchema.describe('The merged merge request'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.merge_commit_message !== undefined) body.merge_commit_message = params.merge_commit_message;
    if (params.squash_commit_message !== undefined) body.squash_commit_message = params.squash_commit_message;
    if (params.squash !== undefined) body.squash = params.squash;
    if (params.should_remove_source_branch !== undefined)
      body.should_remove_source_branch = params.should_remove_source_branch;

    const data = await api<Record<string, unknown>>(
      `/projects/${encodeURIComponent(params.project)}/merge_requests/${params.merge_request_iid}/merge`,
      { method: 'PUT', body },
    );
    return { merge_request: mapMergeRequest(data) };
  },
});
