// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { graphql } from '../linear-api.js';

export const listIssues = defineTool({
  name: 'list_issues',
  displayName: 'List Issues',
  description: 'List issues from Linear. Optionally filter by team, assignee, or state.',
  summary: 'List issues with optional filters',
  icon: 'list',
  group: 'Issues',
  input: z.object({
    teamId: z.string().optional().describe('Filter issues by team ID'),
    assigneeId: z.string().optional().describe('Filter issues by assignee user ID'),
    stateId: z.string().optional().describe('Filter issues by workflow state ID'),
    first: z.number().int().min(1).max(100).optional().describe('Maximum number of issues to return'),
  }),
  output: z.object({
    issues: z
      .array(
        z.object({
          id: z.string(),
          identifier: z.string().optional(),
          title: z.string(),
        })
      )
      .describe('List of issues'),
  }),
  handle: async (params: { teamId?: string; assigneeId?: string; stateId?: string }) => {
    // NEVER executed by the importer.
    // Upstream: graphql `issues` query (always POST transport) -> read.
    const data = await graphql<{ issues: { nodes: Array<{ id: string; title: string }> } }>(
      'query Issues($filter: IssueFilter) { issues(filter: $filter) { nodes { id title } } }',
      { filter: { team: params.teamId, assignee: params.assigneeId, state: params.stateId } }
    );
    return { issues: data.issues.nodes };
  },
});
