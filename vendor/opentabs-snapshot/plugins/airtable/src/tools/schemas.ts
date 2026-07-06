import { z } from 'zod';

// --- Workspace ---

export const workspaceSchema = z.object({
  id: z.string().describe('Workspace ID (wsp prefix)'),
  name: z.string().describe('Workspace name'),
  permission_level: z.string().describe('Current user permission level (e.g., owner, editor, commenter, read)'),
  base_count: z.number().int().describe('Number of bases in this workspace'),
});

interface RawWorkspace {
  id?: string;
  name?: string;
  visibleApplicationOrder?: string[];
  sharedWithCurrentUser?: { directPermissionLevel?: string };
}

export const mapWorkspace = (w: RawWorkspace) => ({
  id: w.id ?? '',
  name: w.name ?? '',
  permission_level: w.sharedWithCurrentUser?.directPermissionLevel ?? '',
  base_count: w.visibleApplicationOrder?.length ?? 0,
});

// --- Base (Application) ---

export const baseSchema = z.object({
  id: z.string().describe('Base ID (app prefix)'),
  name: z.string().describe('Base name'),
  color: z.string().describe('Base color in the sidebar'),
  permission_level: z.string().describe('Current user effective permission level'),
});

interface RawBase {
  id?: string;
  name?: string;
  color?: string;
  currentUserEffectivePermissionLevel?: string;
}

export const mapBase = (b: RawBase) => ({
  id: b.id ?? '',
  name: b.name ?? '',
  color: b.color ?? '',
  permission_level: b.currentUserEffectivePermissionLevel ?? '',
});

// --- Table Schema ---

export const fieldSchema = z.object({
  id: z.string().describe('Field/column ID (fld prefix)'),
  name: z.string().describe('Field name'),
  type: z.string().describe('Field type (text, multilineText, select, collaborator, multipleAttachment, number, etc.)'),
  description: z.string().describe('Field description if set'),
});

export const viewSchema = z.object({
  id: z.string().describe('View ID (viw prefix)'),
  name: z.string().describe('View name'),
  type: z.string().describe('View type (grid, form, kanban, calendar, gallery, gantt, timeline)'),
});

export const tableSchema = z.object({
  id: z.string().describe('Table ID (tbl prefix)'),
  name: z.string().describe('Table name'),
  fields: z.array(fieldSchema).describe('Columns/fields in this table'),
  views: z.array(viewSchema).describe('Views available for this table'),
});

interface RawField {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
}

interface RawView {
  id?: string;
  name?: string;
  type?: string;
}

interface RawTableSchema {
  id?: string;
  name?: string;
  columns?: RawField[];
  views?: RawView[];
}

export const mapField = (f: RawField) => ({
  id: f.id ?? '',
  name: f.name ?? '',
  type: f.type ?? '',
  description: f.description ?? '',
});

export const mapView = (v: RawView) => ({
  id: v.id ?? '',
  name: v.name ?? '',
  type: v.type ?? '',
});

export const mapTable = (t: RawTableSchema) => ({
  id: t.id ?? '',
  name: t.name ?? '',
  fields: (t.columns ?? []).map(mapField),
  views: (t.views ?? []).map(mapView),
});

// --- Record (Row) ---

export const recordSchema = z.object({
  id: z.string().describe('Record ID (rec prefix)'),
  created_time: z.string().describe('ISO 8601 creation timestamp'),
  cell_values: z.record(z.string(), z.unknown()).describe('Cell values keyed by field ID — values vary by field type'),
});

interface RawRecord {
  id?: string;
  createdTime?: string;
  cellValuesByColumnId?: Record<string, unknown>;
}

export const mapRecord = (
  r: RawRecord,
): {
  id: string;
  created_time: string;
  cell_values: Record<string, unknown>;
} => ({
  id: r.id ?? '',
  created_time: r.createdTime ?? '',
  cell_values: r.cellValuesByColumnId ?? {},
});

// --- Select Choice ---

export const selectChoiceSchema = z.object({
  id: z.string().describe('Choice ID (sel prefix)'),
  name: z.string().describe('Choice display name'),
  color: z.string().describe('Choice color'),
});

interface RawChoice {
  id?: string;
  name?: string;
  color?: string;
}

export const mapChoice = (c: RawChoice) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  color: c.color ?? '',
});
