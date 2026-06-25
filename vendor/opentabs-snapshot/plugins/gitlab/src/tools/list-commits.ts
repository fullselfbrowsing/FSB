import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { commitSchema, mapCommit } from './schemas.js';

export const listCommits = defineTool({
  name: 'list_commits',
  displayName: 'List Commits',
  description: 'List commits for a project. Can filter by branch, path, and date range.',
  summary: 'List commits for a project',
  icon: 'git-commit-horizontal',
  group: 'Content',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    ref_name: z.string().optional().describe('Branch or tag name (defaults to the default branch)'),
    path: z.string().optional().describe('File or directory path to filter commits'),
    since: z.string().optional().describe('Only commits after this ISO 8601 date'),
    until: z.string().optional().describe('Only commits before this ISO 8601 date'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    commits: z.array(commitSchema).describe('List of commits'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      per_page: params.per_page ?? 20,
      page: params.page,
    };
    if (params.ref_name) query.ref_name = params.ref_name;
    if (params.path) query.path = params.path;
    if (params.since) query.since = params.since;
    if (params.until) query.until = params.until;

    const data = await api<Record<string, unknown>[]>(
      `/projects/${encodeURIComponent(params.project)}/repository/commits`,
      { query },
    );
    return { commits: (data ?? []).map(mapCommit) };
  },
});
