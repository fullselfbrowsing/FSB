import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';

interface RawDiffEntry {
  old_path?: string;
  new_path?: string;
  diff?: string;
  new_file?: boolean;
  renamed_file?: boolean;
  deleted_file?: boolean;
}

interface RawMergeRequestChangesResponse {
  changes?: RawDiffEntry[];
}

const diffEntrySchema = z.object({
  old_path: z.string().describe('Previous file path'),
  new_path: z.string().describe('New file path'),
  diff: z.string().describe('Unified diff text'),
  new_file: z.boolean().describe('Whether this is a new file'),
  renamed_file: z.boolean().describe('Whether this file was renamed'),
  deleted_file: z.boolean().describe('Whether this file was deleted'),
});

export const getMergeRequestDiff = defineTool({
  name: 'get_merge_request_diff',
  displayName: 'Get Merge Request Diff',
  description: 'Get the diff changes of a merge request. Returns per-file diffs.',
  summary: 'Get the diff of a merge request',
  icon: 'file-diff',
  group: 'Merge Requests',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    merge_request_iid: z.number().int().min(1).describe('Merge request IID (project-scoped ID)'),
  }),
  output: z.object({
    diffs: z.array(diffEntrySchema).describe('List of file diffs'),
  }),
  handle: async params => {
    const data = await api<RawMergeRequestChangesResponse>(
      `/projects/${encodeURIComponent(params.project)}/merge_requests/${params.merge_request_iid}/changes`,
    );

    const changes = data.changes ?? [];
    return {
      diffs: changes.map(d => ({
        old_path: d.old_path ?? '',
        new_path: d.new_path ?? '',
        diff: d.diff ?? '',
        new_file: d.new_file ?? false,
        renamed_file: d.renamed_file ?? false,
        deleted_file: d.deleted_file ?? false,
      })),
    };
  },
});
