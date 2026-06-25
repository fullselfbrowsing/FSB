import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listAiModels = defineTool({
  name: 'list_ai_models',
  displayName: 'List AI Models',
  description:
    'Search and list Workers AI models available in the account. Returns model names, descriptions, task types, and properties. Supports filtering by name and task.',
  summary: 'List Workers AI models',
  icon: 'brain',
  group: 'AI',
  input: z.object({
    search: z.string().optional().describe('Search query to filter models by name'),
    task: z.string().optional().describe('Filter by task type (e.g., "Text Generation", "Image Classification")'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    models: z
      .array(
        z.object({
          id: z.string().describe('Model ID (UUID)'),
          name: z.string().describe('Model name (e.g., "@cf/meta/llama-3-8b-instruct")'),
          description: z.string().describe('Model description'),
          task: z.string().describe('Task type (e.g., "Text Generation", "Image Classification")'),
        }),
      )
      .describe('List of AI models'),
  }),
  handle: async params => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/ai/models/search`,
      {
        query: {
          search: params.search,
          task: params.task,
          per_page: params.per_page ?? 20,
          page: params.page ?? 1,
        },
      },
    );
    const models = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      models: models.map(m => {
        const task = m.task as Record<string, unknown> | undefined;
        return {
          id: (m.id as string) ?? '',
          name: (m.name as string) ?? '',
          description: (m.description as string) ?? '',
          task: (task?.name as string) ?? '',
        };
      }),
    };
  },
});
