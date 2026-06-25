import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { langLinkSchema, mapLangLink } from './schemas.js';
import type { RawLangLink } from './schemas.js';

interface LangLinksResponse {
  query?: {
    pages?: Array<{
      pageid?: number;
      title?: string;
      langlinks?: RawLangLink[];
      missing?: boolean;
    }>;
  };
}

export const getArticleLanguages = defineTool({
  name: 'get_article_languages',
  displayName: 'Get Article Languages',
  description:
    'Get the list of languages an article is available in. Returns language codes, article titles in each language, and URLs.',
  summary: 'List language versions of an article',
  icon: 'languages',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of languages to return (default 50, max 500)'),
  }),
  output: z.object({
    languages: z.array(langLinkSchema),
  }),
  handle: async params => {
    const data = await api<LangLinksResponse>({
      action: 'query',
      titles: params.title,
      prop: 'langlinks',
      lllimit: params.limit ?? 50,
      llprop: 'url',
    });

    const pages = data.query?.pages ?? [];
    const page = pages[0];
    if (!page || page.missing) {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return {
      languages: (page.langlinks ?? []).map(mapLangLink),
    };
  },
});
