import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapProject, paginationSchema, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description: 'List all projects in the Linear workspace. Supports pagination.',
  summary: 'List all projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    limit: z.number().optional().describe('Maximum number of projects to return (default 25, max 50)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    pagination: paginationSchema.describe('Pagination info for fetching more results'),
  }),
  handle: async params => {
    const limit = Math.min(params.limit ?? 25, 50);

    const data = await graphql<{
      projects: {
        nodes: Record<string, unknown>[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    }>(
      `query ListProjects($first: Int, $after: String) {
        projects(first: $first, after: $after, orderBy: updatedAt) {
          nodes {
            id name description url createdAt updatedAt
            targetDate startDate
            status { name }
            lead { name displayName }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { first: limit, after: params.after },
    );

    if (!data.projects) throw ToolError.internal('Projects query returned no results object');
    const result = data.projects;
    return {
      projects: result.nodes.map(n => mapProject(n as Parameters<typeof mapProject>[0])),
      pagination: {
        has_next_page: result.pageInfo?.hasNextPage ?? false,
        end_cursor: result.pageInfo?.endCursor ?? '',
      },
    };
  },
});
