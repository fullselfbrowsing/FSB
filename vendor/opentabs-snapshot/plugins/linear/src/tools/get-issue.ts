// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { graphql } from '../linear-api.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description: 'Get a single issue from Linear by its ID or identifier.',
  summary: 'Get a single issue',
  icon: 'file',
  group: 'Issues',
  input: z.object({
    issueId: z.string().min(1).describe('Issue ID or identifier (e.g. ENG-123) to fetch'),
  }),
  output: z.object({
    issue: z
      .object({
        id: z.string(),
        identifier: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
      })
      .describe('The requested issue'),
  }),
  handle: async (params: { issueId: string }) => {
    // NEVER executed by the importer.
    // Upstream: graphql `issue` query (always POST transport) -> read.
    const data = await graphql<{ issue: { id: string; title: string } }>(
      'query Issue($id: String!) { issue(id: $id) { id title } }',
      { id: params.issueId }
    );
    return { issue: data.issue };
  },
});
