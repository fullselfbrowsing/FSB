import { graphql } from '../linear-api.js';
import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { issueSchema, mapIssue } from './schemas.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description:
    'Get detailed information about a single Linear issue by its UUID or human-readable identifier (e.g. ENG-123).',
  summary: 'Get details of a single issue',
  icon: 'file-text',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('Issue UUID or human-readable identifier (e.g. "ENG-123")'),
  }),
  output: z.object({
    issue: issueSchema.describe('The requested issue'),
  }),
  handle: async params => {
    // Determine whether input is a UUID or an identifier like ENG-123
    const isIdentifier = /^[A-Z]+-\d+$/i.test(params.issue_id);

    if (isIdentifier) {
      // Use searchIssues to find by identifier
      const data = await graphql<{
        searchIssues: { nodes: Record<string, unknown>[] };
      }>(
        `query GetIssueByIdentifier($identifier: String!) {
          searchIssues(term: $identifier, first: 1) {
            nodes {
              id identifier title description priority priorityLabel url
              createdAt updatedAt dueDate estimate
              state { name type }
              assignee { name displayName }
              team { key name }
              labels { nodes { name } }
              project { name }
              cycle { number }
            }
          }
        }`,
        { identifier: params.issue_id },
      );

      const node = data.searchIssues?.nodes?.[0];
      if (!node) {
        throw ToolError.notFound(`Issue not found: ${params.issue_id}`);
      }
      return { issue: mapIssue(node as Parameters<typeof mapIssue>[0]) };
    }

    // UUID lookup
    const data = await graphql<{ issue: Record<string, unknown> }>(
      `query GetIssue($id: String!) {
        issue(id: $id) {
          id identifier title description priority priorityLabel url
          createdAt updatedAt dueDate estimate
          state { name type }
          assignee { name displayName }
          team { key name }
          labels { nodes { name } }
          project { name }
          cycle { number }
        }
      }`,
      { id: params.issue_id },
    );

    return { issue: mapIssue(data.issue as Parameters<typeof mapIssue>[0]) };
  },
});
