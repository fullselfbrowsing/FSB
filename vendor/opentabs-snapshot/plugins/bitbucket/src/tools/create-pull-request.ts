// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bitbucket-api.js';

export const createPullRequest = defineTool({
  name: 'create_pull_request',
  displayName: 'Create Pull Request',
  description:
    'Open a new pull request in a Bitbucket repository from a source branch into a destination branch. Requires a workspace, repo_slug, source branch, destination branch, and title.',
  summary: 'Open a new pull request',
  icon: 'git-pull-request-create',
  group: 'Pull Requests',
  input: z.object({
    workspace: z.string().min(1).describe('Workspace ID or slug that owns the repository'),
    repo_slug: z.string().min(1).describe('Repository slug'),
    source_branch: z.string().min(1).describe('Source branch name to merge from'),
    destination_branch: z.string().min(1).describe('Destination branch name to merge into'),
    title: z.string().min(1).describe('Pull request title'),
    description: z.string().optional().describe('Pull request description in markdown'),
    reviewers: z.array(z.string()).optional().describe('Reviewer account UUIDs'),
    close_source_branch: z.boolean().optional().describe('Delete the source branch on merge'),
  }),
  output: z.object({
    id: z.number().describe('The created pull request ID'),
    title: z.string().describe('The created pull request title'),
  }),
  handle: async (params: { workspace: string; repo_slug: string; source_branch: string; destination_branch: string; title: string }) => {
    // NEVER executed by the importer. Upstream: api POST /repositories/:ws/:repo/pullrequests.
    const data = await api<{ id: number; title: string }>(
      `/repositories/${params.workspace}/${params.repo_slug}/pullrequests`,
      {
        method: 'POST',
        body: {
          title: params.title,
          source: { branch: { name: params.source_branch } },
          destination: { branch: { name: params.destination_branch } },
        },
      }
    );
    return data;
  },
});
