// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const searchIssues = defineTool({
  name: 'search_issues',
  displayName: 'Search Issues',
  description: 'Search for Jira issues using a JQL (Jira Query Language) query string.',
  summary: 'Search issues with JQL',
  icon: 'search',
  group: 'Issues',
  input: z.object({
    jql: z.string().min(1).describe('JQL query string (e.g. project = ENG AND status = "In Progress")'),
    max_results: z.number().int().min(1).max(100).optional().describe('Maximum number of issues to return'),
    start_at: z.number().int().min(0).optional().describe('Index of the first issue to return (pagination)'),
    fields: z.array(z.string()).optional().describe('Issue field names to include in the response'),
  }),
  output: z.object({
    issues: z
      .array(z.object({ id: z.string(), key: z.string() }))
      .describe('Matching issues'),
    total: z.number().optional().describe('Total number of matching issues'),
  }),
  handle: async (params: { jql: string }) => {
    // NEVER executed by the importer. Upstream: api GET /rest/api/3/search (default method, read).
    const data = await api<{ issues: Array<{ id: string; key: string }> }>('/rest/api/3/search', {
      query: { jql: params.jql },
    });
    return data;
  },
});
