import { z } from 'zod';

// --- Column schema (shared across query tools) ---

export const columnSchema = z.object({
  name: z.string().describe('Column name'),
  typeName: z.string().describe('Snowflake data type (e.g., NUMBER, VARCHAR, TIMESTAMP_NTZ)'),
  nullable: z.boolean().describe('Whether the column allows NULL values'),
});

export interface RawColumn {
  name?: string;
  typeName?: string;
  nullable?: boolean;
  precision?: number;
  scale?: number;
}

export const mapColumn = (c: RawColumn) => ({
  name: c.name ?? '',
  typeName: c.typeName ?? '',
  nullable: c.nullable ?? true,
});

// --- Query execution result ---

export const executionSchema = z.object({
  queryId: z.string().describe('Unique query ID for fetching additional chunks'),
  status: z.string().describe('Query execution status (SUCCESS or error)'),
  durationMs: z.number().describe('Total execution time in milliseconds'),
  warehouseName: z.string().describe('Warehouse used for execution'),
  statementType: z.string().describe('Statement type (SELECT, SHOW, DESCRIBE, etc.)'),
  error: z.string().nullable().describe('Error message if query failed, null on success'),
});

// --- Row data (all values are strings per Snowflake JSON format) ---

export const rowSchema = z
  .record(z.string(), z.string().nullable())
  .describe('Row data as column-name to value mapping. All values are strings or null per Snowflake JSON format.');

// --- Worksheet entity ---

export const worksheetSchema = z.object({
  entityId: z.string().describe('Worksheet entity ID'),
  name: z.string().describe('Worksheet name'),
  created: z.string().describe('Creation timestamp (ISO 8601)'),
  modified: z.string().describe('Last modified timestamp (ISO 8601)'),
  queryLanguage: z.string().describe('Query language (sql or python)'),
  role: z.string().describe('Role used by the worksheet'),
  url: z.string().describe('Relative URL path to the worksheet'),
  visibility: z.string().describe('Visibility (private, organization)'),
  folderId: z.string().nullable().describe('Parent folder ID, null if at root'),
});

export interface RawWorksheetInfo {
  name?: string;
  created?: string;
  modified?: string;
  queryLanguage?: string;
  role?: string;
  url?: string;
  visibility?: string;
  folderId?: string | null;
}

export const mapWorksheet = (entityId: string, info: RawWorksheetInfo) => ({
  entityId,
  name: info.name ?? '',
  created: info.created ?? '',
  modified: info.modified ?? '',
  queryLanguage: info.queryLanguage ?? 'sql',
  role: info.role ?? '',
  url: info.url ?? '',
  visibility: info.visibility ?? '',
  folderId: info.folderId ?? null,
});

// --- Folder entity ---

export const folderSchema = z.object({
  entityId: z.string().describe('Folder entity ID'),
  name: z.string().describe('Folder name'),
  created: z.string().describe('Creation timestamp (ISO 8601)'),
  modified: z.string().describe('Last modified timestamp (ISO 8601)'),
  url: z.string().describe('Relative URL path to the folder'),
  visibility: z.string().describe('Visibility (private, organization)'),
});

export const mapFolder = (entityId: string, info: RawWorksheetInfo) => ({
  entityId,
  name: info.name ?? '',
  created: info.created ?? '',
  modified: info.modified ?? '',
  url: info.url ?? '',
  visibility: info.visibility ?? '',
});

// --- Database/schema/table from SHOW commands ---

export const databaseSchema = z.object({
  name: z.string().describe('Database name'),
  owner: z.string().describe('Database owner role'),
  kind: z.string().describe('Database kind (STANDARD or APPLICATION)'),
  created_on: z.string().describe('Creation timestamp'),
  comment: z.string().describe('Database comment'),
});

export const mapDatabase = (row: string[]) => ({
  name: row[1] ?? '',
  owner: row[5] ?? '',
  kind: row[9] ?? 'STANDARD',
  created_on: row[0] ?? '',
  comment: row[6] ?? '',
});

export const schemaInfoSchema = z.object({
  name: z.string().describe('Schema name'),
  database_name: z.string().describe('Parent database name'),
  owner: z.string().describe('Schema owner role'),
  created_on: z.string().describe('Creation timestamp'),
  comment: z.string().describe('Schema comment'),
});

export const mapSchemaInfo = (row: string[]) => ({
  name: row[1] ?? '',
  database_name: row[4] ?? '',
  owner: row[5] ?? '',
  created_on: row[0] ?? '',
  comment: row[6] ?? '',
});

export const tableColumnSchema = z.object({
  name: z.string().describe('Column name'),
  type: z.string().describe('Column data type'),
  kind: z.string().describe('Column kind (COLUMN)'),
  nullable: z.string().describe('Y if nullable, N if not'),
  default: z.string().nullable().describe('Default value expression, null if none'),
  primaryKey: z.string().describe('Y if part of primary key'),
  uniqueKey: z.string().describe('Y if part of unique key'),
  comment: z.string().nullable().describe('Column comment'),
});

export const mapTableColumn = (row: string[]) => ({
  name: row[0] ?? '',
  type: row[1] ?? '',
  kind: row[2] ?? 'COLUMN',
  nullable: row[3] ?? 'Y',
  default: row[4] || null,
  primaryKey: row[5] ?? 'N',
  uniqueKey: row[6] ?? 'N',
  comment: row[7] || null,
});

// --- Warehouse ---

export const warehouseSchema = z.object({
  name: z.string().describe('Warehouse name'),
  state: z.string().describe('Current state (STARTED, SUSPENDED, RESIZING)'),
  type: z.string().describe('Warehouse type (STANDARD, SNOWPARK_OPTIMIZED)'),
  size: z.string().describe('Warehouse size (X-Small, Small, Medium, etc.)'),
  auto_suspend: z.string().describe('Auto-suspend timeout in seconds'),
  auto_resume: z.string().describe('Whether auto-resume is enabled'),
  owner: z.string().describe('Owner role'),
  running: z.string().describe('Number of running queries'),
  queued: z.string().describe('Number of queued queries'),
});

export const mapWarehouse = (row: string[]) => ({
  name: row[0] ?? '',
  state: row[1] ?? '',
  type: row[2] ?? '',
  size: row[3] ?? '',
  auto_suspend: row[11] ?? '',
  auto_resume: row[12] ?? '',
  owner: row[20] ?? '',
  running: row[7] ?? '0',
  queued: row[8] ?? '0',
});
