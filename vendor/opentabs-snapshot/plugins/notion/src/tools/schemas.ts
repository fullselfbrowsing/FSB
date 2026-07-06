import { z } from 'zod';

// --- Block schema ---

export const blockSchema = z.object({
  id: z.string().describe('Block ID (UUID)'),
  type: z.string().describe('Block type (page, text, heading_1, bulleted_list, etc.)'),
  text: z.string().describe('Plain text content of the block'),
  has_children: z.boolean().describe('Whether the block has child blocks'),
  created_time: z.string().describe('ISO 8601 creation timestamp'),
  last_edited_time: z.string().describe('ISO 8601 last edited timestamp'),
  parent_id: z.string().describe('Parent block or page ID'),
});

export const mapBlock = (b: Record<string, unknown> | undefined): z.infer<typeof blockSchema> => {
  const props = b?.properties as Record<string, unknown> | undefined;
  const titleArr = props?.title as unknown[] | undefined;
  const text = richTextToPlain(titleArr);
  const content = b?.content as string[] | undefined;

  return {
    id: (b?.id as string) ?? '',
    type: (b?.type as string) ?? '',
    text,
    has_children: Array.isArray(content) && content.length > 0,
    created_time: formatTimestamp(b?.created_time),
    last_edited_time: formatTimestamp(b?.last_edited_time),
    parent_id: (b?.parent_id as string) ?? '',
  };
};

// --- Page schema ---

export const pageSchema = z.object({
  id: z.string().describe('Page ID (UUID)'),
  title: z.string().describe('Page title'),
  type: z.string().describe('Block type (page, collection_view_page, etc.)'),
  icon: z.string().describe('Page icon (emoji or URL)'),
  cover: z.string().describe('Page cover image path'),
  parent_id: z.string().describe('Parent ID (space ID or parent block ID)'),
  parent_type: z.string().describe('Parent type (space, block, or collection)'),
  created_time: z.string().describe('ISO 8601 creation timestamp'),
  last_edited_time: z.string().describe('ISO 8601 last edited timestamp'),
  created_by: z.string().describe('User ID of the creator'),
  last_edited_by: z.string().describe('User ID of the last editor'),
  url: z.string().describe('Full URL to the page'),
});

export const mapPage = (b: Record<string, unknown> | undefined): z.infer<typeof pageSchema> => {
  const props = b?.properties as Record<string, unknown> | undefined;
  const titleArr = props?.title as unknown[] | undefined;
  const format = b?.format as Record<string, unknown> | undefined;
  const id = (b?.id as string) ?? '';

  return {
    id,
    title: richTextToPlain(titleArr),
    type: (b?.type as string) ?? '',
    icon: (format?.page_icon as string) ?? '',
    cover: (format?.page_cover as string) ?? '',
    parent_id: (b?.parent_id as string) ?? '',
    parent_type: (b?.parent_table as string) ?? '',
    created_time: formatTimestamp(b?.created_time),
    last_edited_time: formatTimestamp(b?.last_edited_time),
    created_by: (b?.created_by_id as string) ?? '',
    last_edited_by: (b?.last_edited_by_id as string) ?? '',
    url: id ? `https://www.notion.so/${id.replace(/-/g, '')}` : '',
  };
};

// --- User schema ---

export const userSchema = z.object({
  id: z.string().describe('User ID (UUID)'),
  name: z.string().describe('Full name'),
  email: z.string().describe('Email address'),
  profile_photo: z.string().describe('Profile photo URL'),
});

export const mapUser = (u: Record<string, unknown> | undefined): z.infer<typeof userSchema> => ({
  id: (u?.id as string) ?? '',
  name: (u?.name as string) ?? '',
  email: (u?.email as string) ?? '',
  profile_photo: (u?.profile_photo as string) ?? '',
});

// --- Database schema ---

export const databasePropertySchema = z.object({
  id: z.string().describe('Property ID (internal key)'),
  name: z.string().describe('Property name'),
  type: z.string().describe('Property type (title, text, number, select, multi_select, date, person, etc.)'),
  options: z
    .array(
      z.object({
        id: z.string().describe('Option ID'),
        value: z.string().describe('Option value'),
        color: z.string().describe('Option color'),
      }),
    )
    .describe('Available options (for select/multi_select types)'),
});

export const databaseSchema = z.object({
  id: z.string().describe('Database (collection) ID'),
  name: z.string().describe('Database name'),
  icon: z.string().describe('Database icon'),
  properties: z.array(databasePropertySchema).describe('Database properties/columns'),
  parent_id: z.string().describe('Parent page ID'),
});

export const mapDatabase = (c: Record<string, unknown> | undefined): z.infer<typeof databaseSchema> => {
  const schema = c?.schema as Record<string, Record<string, unknown>> | undefined;
  const properties = schema
    ? Object.entries(schema).map(([key, prop]) => ({
        id: key,
        name: (prop.name as string) ?? '',
        type: (prop.type as string) ?? '',
        options: Array.isArray(prop.options)
          ? (prop.options as Record<string, unknown>[]).map(o => ({
              id: (o.id as string) ?? '',
              value: (o.value as string) ?? '',
              color: (o.color as string) ?? '',
            }))
          : [],
      }))
    : [];

  const nameArr = c?.name as unknown[] | undefined;

  return {
    id: (c?.id as string) ?? '',
    name: richTextToPlain(nameArr),
    icon: (c?.icon as string) ?? '',
    properties,
    parent_id: (c?.parent_id as string) ?? '',
  };
};

// --- Database item (row) schema ---

export const databaseItemSchema = z.object({
  id: z.string().describe('Row/page ID'),
  title: z.string().describe('Title of the row'),
  properties: z
    .record(z.string(), z.string())
    .describe('Property values as key-value pairs (property name -> string value)'),
  url: z.string().describe('Full URL to the page'),
  created_time: z.string().describe('ISO 8601 creation timestamp'),
  last_edited_time: z.string().describe('ISO 8601 last edited timestamp'),
});

export const mapDatabaseItem = (
  b: Record<string, unknown> | undefined,
  schema: Record<string, Record<string, unknown>> | undefined,
): z.infer<typeof databaseItemSchema> => {
  const props = b?.properties as Record<string, unknown> | undefined;
  const id = (b?.id as string) ?? '';

  // Map properties using schema to get readable names
  const propertyValues: Record<string, string> = {};
  if (props && schema) {
    for (const [key, schemaProp] of Object.entries(schema)) {
      const name = (schemaProp.name as string) ?? key;
      const value = props[key];
      if (value !== undefined) {
        propertyValues[name] = richTextToPlain(value as unknown[]);
      }
    }
  }

  const titleArr = props?.title as unknown[] | undefined;

  return {
    id,
    title: richTextToPlain(titleArr),
    properties: propertyValues,
    url: id ? `https://www.notion.so/${id.replace(/-/g, '')}` : '',
    created_time: formatTimestamp(b?.created_time),
    last_edited_time: formatTimestamp(b?.last_edited_time),
  };
};

// --- Helpers ---

const richTextToPlain = (richText: unknown): string => {
  if (!Array.isArray(richText)) return '';
  return richText
    .map(segment => {
      if (Array.isArray(segment) && typeof segment[0] === 'string') return segment[0];
      if (typeof segment === 'string') return segment;
      return '';
    })
    .join('');
};

const formatTimestamp = (ts: unknown): string => {
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (typeof ts === 'string') return ts;
  return '';
};
