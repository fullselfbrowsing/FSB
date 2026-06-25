import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam, workflowExecutionSchema, mapWorkflowExecution, type RawWorkflowExecution } from './schemas.js';

export const listWorkflows = defineTool({
  name: 'list_workflows',
  displayName: 'List Workflows',
  description:
    'List workflow executions in a namespace. Supports Temporal visibility query syntax for filtering (e.g., WorkflowType="MyWorkflow", ExecutionStatus="Running"). Defaults to the namespace in the current browser tab if not specified.',
  summary: 'List workflow executions with optional filtering',
  icon: 'list',
  group: 'Workflows',
  input: z.object({
    namespace: namespaceParam,
    query: z
      .string()
      .optional()
      .describe('Temporal visibility query filter (e.g., WorkflowType="MyWorkflow" AND ExecutionStatus="Running")'),
    page_size: z.number().int().min(1).max(200).optional().describe('Results per page (default 100, max 200)'),
    next_page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    workflows: z.array(workflowExecutionSchema).describe('Workflow executions'),
    next_page_token: z.string().describe('Token for next page (empty if no more results)'),
  }),
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<{
      executions?: RawWorkflowExecution[];
      nextPageToken?: string;
    }>(ns, `/namespaces/${ns}/workflows`, {
      query: params.query,
      maximumPageSize: params.page_size ?? 100,
      nextPageToken: params.next_page_token,
    });

    return {
      workflows: (data.executions ?? []).map(mapWorkflowExecution),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
