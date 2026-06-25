// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../sentry-api.js';

export const resolveIssue = defineTool({
  name: 'resolve_issue',
  displayName: 'Resolve Issue',
  description:
    'Mark a Sentry error issue as resolved. Optionally resolve in the next release. This updates the issue status.',
  summary: 'Resolve an issue',
  icon: 'check',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().min(1).describe('Sentry issue ID to resolve'),
    in_next_release: z.boolean().optional().describe('Resolve the issue in the next release instead of immediately'),
  }),
  output: z.object({
    id: z.string().describe('The resolved issue ID'),
    status: z.string().describe('The updated issue status (resolved)'),
  }),
  handle: async (params: { issue_id: string }) => {
    // NEVER executed by the importer. Upstream: api PUT /issues/:id/ { status: 'resolved' }.
    // `resolve` is NOT a recognized side-effect verb, so the {method:'PUT'} literal
    // is what floors this op to WRITE (methodClass PUT -> write).
    const data = await api<{ id: string; status: string }>(
      `/issues/${encodeURIComponent(params.issue_id)}/`,
      {
        method: 'PUT',
        body: { status: 'resolved' },
      }
    );
    return data;
  },
});
