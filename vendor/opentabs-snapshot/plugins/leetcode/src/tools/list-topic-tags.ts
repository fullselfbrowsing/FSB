import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { mapTopicTag, topicTagSchema } from './schemas.js';

export const listTopicTags = defineTool({
  name: 'list_topic_tags',
  displayName: 'List Topic Tags',
  description:
    'List all available topic tags (e.g., Array, Dynamic Programming, Graph). Use tag slugs with list_problems to filter problems by topic.',
  summary: 'List all topic tags',
  icon: 'tags',
  group: 'Problems',
  input: z.object({}),
  output: z.object({
    tags: z.array(topicTagSchema),
  }),
  handle: async () => {
    const data = await graphql<{
      questionTopicTags: {
        edges: Array<{ node: { name?: string; slug?: string } }>;
      };
    }>(
      `query questionTopicTags {
				questionTopicTags {
					edges { node { name slug } }
				}
			}`,
    );

    const tags = (data.questionTopicTags?.edges ?? []).map(e => mapTopicTag(e.node ?? {}));

    return { tags };
  },
});
