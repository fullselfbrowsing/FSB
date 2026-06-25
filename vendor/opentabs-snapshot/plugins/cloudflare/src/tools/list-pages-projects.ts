import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';
import { mapPagesProject, pagesProjectSchema } from './schemas.js';

export const listPagesProjects = defineTool({
  name: 'list_pages_projects',
  displayName: 'List Pages Projects',
  description:
    'List all Cloudflare Pages projects in the account. Returns project names, subdomains, production branches, and linked Git repositories.',
  summary: 'List Pages projects',
  icon: 'file-text',
  group: 'Pages',
  input: z.object({}),
  output: z.object({
    projects: z.array(pagesProjectSchema).describe('List of Pages projects'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation(
        'Could not determine account ID from the current URL. Navigate to an account page first.',
      );
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects`,
    );
    const projects = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return { projects: projects.map(p => mapPagesProject(p)) };
  },
});
