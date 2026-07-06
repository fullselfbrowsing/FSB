import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, mutations } from '../meticulous-api.js';

export const acceptAllDiffs = defineTool({
  name: 'accept_all_diffs',
  displayName: 'Accept All Diffs',
  description:
    'Accept (approve) all visual differences in a test run. This marks all screenshot diffs as expected/approved for the associated pull request.',
  summary: 'Approve all diffs in a test run',
  icon: 'check-circle',
  group: 'Test Runs',
  input: z.object({
    pull_request_id: z.string().describe("Pull request ID (from test run's pullRequest.id field)"),
    test_run_id: z.string().describe('Test run ID'),
  }),
  output: z.object({
    approval_state: z.string().nullable().describe('Updated PR approval state'),
  }),
  handle: async ({ pull_request_id, test_run_id }) => {
    const data = await graphql<{ acceptAllDiffs: { pullRequest: { approvalState: string } } }>(
      mutations.ACCEPT_ALL_DIFFS,
      { pullRequestId: pull_request_id, testRunId: test_run_id },
    );
    return { approval_state: data.acceptAllDiffs.pullRequest?.approvalState ?? null };
  },
});
