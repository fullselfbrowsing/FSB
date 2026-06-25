import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { issueSchema, mapIssue, paginationSchema } from './schemas.js';

const ISSUE_FIELDS = `
  id identifier title description priority priorityLabel url
  createdAt updatedAt dueDate estimate
  state { name type }
  assignee { name displayName }
  team { key name }
  labels { nodes { name } }
  project { name }
  cycle { number }
`;

export const searchIssues = defineTool({
  name: 'search_issues',
  displayName: 'Search Issues',
  description:
    'Search and filter Linear issues. Supports text search, filtering by team, assignee, state, label, project, and more. Returns paginated results.',
  summary: 'Search and filter issues',
  icon: 'search',
  group: 'Issues',
  input: z.object({
    query: z.string().optional().describe('Text search query to find issues by title or description'),
    team_key: z.string().optional().describe('Filter by team key (e.g. "ENG")'),
    assignee_name: z.string().optional().describe('Filter by assignee display name (partial match)'),
    state_name: z.string().optional().describe('Filter by workflow state name (e.g. "In Progress", "Done")'),
    label_name: z.string().optional().describe('Filter by label name'),
    project_name: z.string().optional().describe('Filter by project name'),
    priority: z.number().optional().describe('Filter by priority level (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
    limit: z.number().optional().describe('Maximum number of issues to return (default 25, max 50)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    issues: z.array(issueSchema).describe('List of matching issues'),
    pagination: paginationSchema.describe('Pagination info for fetching more results'),
    total_count: z.number().describe('Total number of matching issues (-1 if unavailable)'),
  }),
  handle: async params => {
    const limit = Math.min(params.limit ?? 25, 50);

    const filter: Record<string, unknown> = {};
    if (params.team_key) filter.team = { key: { eq: params.team_key } };
    if (params.state_name) filter.state = { name: { eqCaseInsensitive: params.state_name } };
    if (params.label_name) filter.labels = { name: { eqCaseInsensitive: params.label_name } };
    if (params.priority !== undefined) filter.priority = { eq: params.priority };
    if (params.assignee_name) filter.assignee = { displayName: { containsIgnoreCase: params.assignee_name } };
    if (params.project_name) filter.project = { name: { containsIgnoreCase: params.project_name } };
    const filterArg = Object.keys(filter).length > 0 ? filter : undefined;

    // Text search uses searchIssues (ranked). It supports totalCount.
    if (params.query) {
      const data = await graphql<{
        searchIssues: {
          nodes: Record<string, unknown>[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
          totalCount: number;
        };
      }>(
        `query SearchIssues($query: String!, $first: Int, $after: String, $filter: IssueFilter) {
          searchIssues(term: $query, first: $first, after: $after, filter: $filter) {
            nodes { ${ISSUE_FIELDS} }
            pageInfo { hasNextPage endCursor }
            totalCount
          }
        }`,
        { query: params.query, first: limit, after: params.after, filter: filterArg },
      );

      if (!data.searchIssues) throw ToolError.internal('Search returned no results object');
      const result = data.searchIssues;
      return {
        issues: result.nodes.map(n => mapIssue(n as Parameters<typeof mapIssue>[0])),
        pagination: {
          has_next_page: result.pageInfo?.hasNextPage ?? false,
          end_cursor: result.pageInfo?.endCursor ?? '',
        },
        total_count: result.totalCount ?? 0,
      };
    }

    // No text query — use issues() with filters. IssueConnection has no totalCount.
    const data = await graphql<{
      issues: {
        nodes: Record<string, unknown>[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    }>(
      `query ListIssues($first: Int, $after: String, $filter: IssueFilter) {
        issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
          nodes { ${ISSUE_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { first: limit, after: params.after, filter: filterArg },
    );

    if (!data.issues) throw ToolError.internal('Issues query returned no results object');
    const result = data.issues;
    return {
      issues: result.nodes.map(n => mapIssue(n as Parameters<typeof mapIssue>[0])),
      pagination: {
        has_next_page: result.pageInfo?.hasNextPage ?? false,
        end_cursor: result.pageInfo?.endCursor ?? '',
      },
      total_count: -1,
    };
  },
});
