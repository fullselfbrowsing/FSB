import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapPipeline, pipelineSchema } from './schemas.js';

export const listPipelines = defineTool({
  name: 'list_pipelines',
  displayName: 'List Pipelines',
  description: 'List CI/CD pipelines for a project. Can filter by status, ref, and source.',
  summary: 'List CI/CD pipelines',
  icon: 'workflow',
  group: 'CI/CD',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    status: z
      .enum(['running', 'pending', 'success', 'failed', 'canceled', 'skipped', 'manual', 'scheduled'])
      .optional()
      .describe('Filter by pipeline status'),
    ref: z.string().optional().describe('Filter by branch or tag name'),
    source: z.string().optional().describe('Filter by source (e.g., push, web, schedule, merge_request_event)'),
    order_by: z.enum(['id', 'status', 'ref', 'updated_at', 'user_id']).optional().describe('Sort field (default: id)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    pipelines: z.array(pipelineSchema).describe('List of pipelines'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      per_page: params.per_page ?? 20,
      page: params.page,
      order_by: params.order_by,
      sort: params.sort,
    };
    if (params.status) query.status = params.status;
    if (params.ref) query.ref = params.ref;
    if (params.source) query.source = params.source;

    const data = await api<Record<string, unknown>[]>(`/projects/${encodeURIComponent(params.project)}/pipelines`, {
      query,
    });
    return { pipelines: (data ?? []).map(mapPipeline) };
  },
});
