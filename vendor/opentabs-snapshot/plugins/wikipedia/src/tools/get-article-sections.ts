import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { sectionSchema, mapSection } from './schemas.js';
import type { RawSection } from './schemas.js';

interface ParseResponse {
  parse?: {
    title?: string;
    sections?: RawSection[];
  };
  error?: { code?: string; info?: string };
}

export const getArticleSections = defineTool({
  name: 'get_article_sections',
  displayName: 'Get Article Sections',
  description:
    'Get the table of contents (section headings) of a Wikipedia article. Returns section index, heading level, heading text, and anchor. Use the section index with get_section_content to read individual sections.',
  summary: 'Get the table of contents of an article',
  icon: 'list-tree',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
  }),
  output: z.object({
    title: z.string().describe('Canonical article title'),
    sections: z.array(sectionSchema),
  }),
  handle: async params => {
    const data = await api<ParseResponse>({
      action: 'parse',
      page: params.title,
      prop: 'sections',
    });

    if (data.error?.code === 'missingtitle') {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return {
      title: data.parse?.title ?? params.title,
      sections: (data.parse?.sections ?? []).map(mapSection),
    };
  },
});
