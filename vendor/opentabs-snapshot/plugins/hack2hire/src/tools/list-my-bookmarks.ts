import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type Hack2HireList, api } from '../hack2hire-api.js';
import { type RawBookmarkRecord, bookmarkRecordSchema, mapBookmarkRecord } from './schemas.js';

export const listMyBookmarks = defineTool({
  name: 'list_my_bookmarks',
  displayName: 'List My Bookmarks',
  description:
    "List the authenticated user's bookmarked interview questions. Each record includes the bookmark ID, the bookmarked post ID, when it was bookmarked, and a snapshot of the post (id, type, title, locked status). Optionally filter to a specific postId to check whether the user has bookmarked it.",
  summary: 'List my bookmarked questions',
  icon: 'bookmark',
  group: 'Account',
  input: z.object({
    postId: z
      .string()
      .optional()
      .describe('If provided, only return the bookmark record for this specific post ID (or empty if not bookmarked).'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    perPage: z.number().int().min(1).max(999).optional().describe('Results per page (default 25, max 999).'),
  }),
  output: z.object({
    bookmarks: z.array(bookmarkRecordSchema),
    total: z.number().int().describe('Total bookmarks matching the filters across all pages.'),
    page: z.number().int(),
    perPage: z.number().int(),
  }),
  handle: async params => {
    const data = await api<Hack2HireList<RawBookmarkRecord>>('/user/filter-bookmark-post-records', {
      page: params.page ?? 1,
      perPage: params.perPage ?? 25,
      postId: params.postId,
    });
    return {
      bookmarks: (data.data ?? []).map(mapBookmarkRecord),
      total: data.total ?? 0,
      page: data.page ?? 1,
      perPage: data.perPage ?? 25,
    };
  },
});
