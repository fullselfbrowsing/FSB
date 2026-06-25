import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { vercelApi } from '../vercel-api.js';
import { deploymentSchema, mapDeployment } from './schemas.js';

export const listDeployments = defineTool({
  name: 'list_deployments',
  displayName: 'List Deployments',
  description:
    'List deployments for the current team/account, optionally filtered by project. Returns deployment URLs, states, Git metadata, and timestamps.',
  summary: 'List Vercel deployments',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    project: z.string().optional().describe('Filter by project name or ID'),
    target: z.enum(['production', 'preview']).optional().describe('Filter by deployment target'),
    state: z
      .enum(['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED'])
      .optional()
      .describe('Filter by deployment state'),
    limit: z.number().optional().describe('Maximum number of deployments to return (default 20, max 100)'),
    from: z.string().optional().describe('Pagination cursor — timestamp in ms to fetch deployments before'),
  }),
  output: z.object({
    deployments: z.array(deploymentSchema).describe('List of deployments'),
    pagination: z
      .object({
        count: z.number().describe('Number of deployments returned'),
        next: z.string().nullable().describe('Next page cursor (pass as "from" for next page)'),
      })
      .describe('Pagination info'),
  }),
  handle: async params => {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 20,
      from: params.from,
      projectId: params.project,
      target: params.target,
      state: params.state,
    };

    const data = await vercelApi<Record<string, unknown>>('/v6/deployments', { query });
    const deployments = Array.isArray(data.deployments) ? (data.deployments as Record<string, unknown>[]) : [];
    const pagination = data.pagination as Record<string, unknown> | undefined;
    return {
      deployments: deployments.map(d => mapDeployment(d)),
      pagination: {
        count: (pagination?.count as number) ?? deployments.length,
        next: (pagination?.next as string) ?? null,
      },
    };
  },
});
