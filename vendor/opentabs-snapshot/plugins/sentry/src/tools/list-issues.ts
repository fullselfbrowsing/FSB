// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../sentry-api.js';

export const listIssues = defineTool({
  name: 'list_issues',
  displayName: 'List Issues',
  description: 'List the error issues for a Sentry project. Optionally filter by query, status, or environment.',
  summary: 'List issues for a project',
  icon: 'list',
  group: 'Issues',
  input: z.object({
    organization_slug: z.string().min(1).describe('Sentry organization slug'),
    project_slug: z.string().min(1).describe('Sentry project slug'),
    query: z.string().optional().describe('Sentry search query (e.g. is:unresolved)'),
    environment: z.string().optional().describe('Filter by environment name'),
    cursor: z.string().optional().describe('Pagination cursor for the next page'),
  }),
  output: z.object({
    issues: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .describe('List of issues'),
  }),
  handle: async (params: { organization_slug: string; project_slug: string }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:org/:project/issues/ (default method).
    const data = await api<{ issues: Array<{ id: string; title: string }> }>(
      `/projects/${encodeURIComponent(params.organization_slug)}/${encodeURIComponent(params.project_slug)}/issues/`
    );
    return data;
  },
});
