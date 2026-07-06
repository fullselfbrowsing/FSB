import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { githubRepoSchema, mapGithubRepo } from './schemas.js';

export const listGithubRepositories = defineTool({
  name: 'list_github_repositories',
  displayName: 'List GitHub Repositories',
  description: 'List GitHub repositories connected to the Meticulous organization via the GitHub App.',
  summary: 'List connected GitHub repos',
  icon: 'github',
  group: 'Integrations',
  input: z.object({}),
  output: z.object({ repositories: z.array(githubRepoSchema) }),
  handle: async () => {
    const data = await graphql<{ gitHubRepositories: Array<Record<string, unknown>> }>(queries.GET_GITHUB_REPOSITORIES);
    return { repositories: data.gitHubRepositories.map(mapGithubRepo) };
  },
});
