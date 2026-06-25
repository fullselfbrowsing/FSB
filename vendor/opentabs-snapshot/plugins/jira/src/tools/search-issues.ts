import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { ISSUE_FIELDS, issueSchema, mapIssue } from './schemas.js';

export const searchIssues = defineTool({
  name: 'search_issues',
  displayName: 'Search Issues',
  description:
    'Search for Jira issues using JQL (Jira Query Language). Supports filtering by project, status, assignee, labels, and more.',
  summary: 'Search issues using JQL',
  icon: 'search',
  group: 'Issues',
  input: z.object({
    jql: z.string().describe('JQL query string (e.g. "project = KAN AND status = \'In Progress\'")'),
    max_results: z.number().optional().describe('Maximum number of results to return (default 20, max 100)'),
    start_at: z.number().optional().describe('Index of the first result to return for pagination'),
  }),
  output: z.object({
    issues: z.array(issueSchema).describe('Matching issues'),
    total: z.number().describe('Total number of matching issues'),
    start_at: z.number().describe('Starting index of returned results'),
  }),
  handle: async params => {
    const data = await api<{
      issues?: Record<string, unknown>[];
      total?: number;
      startAt?: number;
    }>('/search/jql', {
      query: {
        jql: params.jql,
        maxResults: params.max_results ?? 20,
        startAt: params.start_at ?? 0,
        fields: ISSUE_FIELDS.join(','),
      },
    });
    return {
      issues: (data.issues ?? []).map(mapIssue),
      total: data.total ?? 0,
      start_at: data.startAt ?? 0,
    };
  },
});
