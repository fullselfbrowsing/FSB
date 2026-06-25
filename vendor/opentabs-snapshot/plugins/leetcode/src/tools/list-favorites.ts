import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const listFavorites = defineTool({
  name: 'list_favorites',
  displayName: 'List Favorites',
  description:
    'List your LeetCode favorite/problem lists. Each list has a name, visibility, and a list of problem slugs saved in it.',
  summary: 'List your favorite problem lists',
  icon: 'star',
  group: 'Favorites',
  input: z.object({}),
  output: z.object({
    favorites: z.array(
      z.object({
        idHash: z.string().describe('Unique identifier hash for the favorite list'),
        name: z.string().describe('Favorite list name'),
        isPublic: z.boolean().describe('Whether the list is public'),
        questionCount: z.number().describe('Number of questions in the list'),
      }),
    ),
  }),
  handle: async () => {
    const data = await graphql<{
      favoritesLists: {
        allFavorites: Array<{
          idHash?: string;
          name?: string;
          isPublicFavorite?: boolean;
          questions?: Array<{ titleSlug?: string }>;
        }>;
      };
    }>(
      `query favoritesList {
				favoritesLists {
					allFavorites {
						idHash name isPublicFavorite
						questions { titleSlug }
					}
				}
			}`,
    );

    const favorites = (data.favoritesLists?.allFavorites ?? []).map(f => ({
      idHash: f.idHash ?? '',
      name: f.name ?? '',
      isPublic: f.isPublicFavorite ?? false,
      questionCount: f.questions?.length ?? 0,
    }));

    return { favorites };
  },
});
