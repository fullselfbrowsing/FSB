import { z } from 'zod';

// --- Worksheet ---

export const worksheetSchema = z.object({
  id: z.string().describe('Worksheet ID'),
  name: z.string().describe('Worksheet name'),
  position: z.number().int().describe('Zero-based position of the worksheet within the workbook'),
  visibility: z.string().describe('Worksheet visibility: Visible, Hidden, or VeryHidden'),
});

export interface RawWorksheet {
  id?: string;
  name?: string;
  position?: number;
  visibility?: string;
}

export const mapWorksheet = (w: RawWorksheet) => ({
  id: w.id ?? '',
  name: w.name ?? '',
  position: w.position ?? 0,
  visibility: w.visibility ?? 'Visible',
});

// --- Range ---

export const rangeSchema = z.object({
  address: z.string().describe('Range address in A1 notation (e.g., "Sheet1!A1:C3")'),
  row_count: z.number().int().describe('Number of rows in the range'),
  column_count: z.number().int().describe('Number of columns in the range'),
  values: z.array(z.array(z.unknown())).describe('2D array of cell values (strings, numbers, booleans)'),
  formulas: z.array(z.array(z.unknown())).describe('2D array of cell formulas'),
  text: z.array(z.array(z.string())).describe('2D array of formatted text representations of cell values'),
  number_format: z.array(z.array(z.string())).describe('2D array of number format codes'),
});

export interface RawRange {
  address?: string;
  rowCount?: number;
  columnCount?: number;
  values?: unknown[][];
  formulas?: unknown[][];
  text?: string[][];
  numberFormat?: string[][];
}

export const mapRange = (r: RawRange) => ({
  address: r.address ?? '',
  row_count: r.rowCount ?? 0,
  column_count: r.columnCount ?? 0,
  values: r.values ?? [],
  formulas: r.formulas ?? [],
  text: r.text ?? [],
  number_format: r.numberFormat ?? [],
});

// --- Table ---

export const tableSchema = z.object({
  id: z.string().describe('Table ID'),
  name: z.string().describe('Table name'),
  show_headers: z.boolean().describe('Whether the header row is visible'),
  show_totals: z.boolean().describe('Whether the total row is visible'),
  style: z.string().describe('Table style name (e.g., "TableStyleMedium2")'),
});

export interface RawTable {
  id?: string;
  name?: string;
  showHeaders?: boolean;
  showTotals?: boolean;
  style?: string;
}

export const mapTable = (t: RawTable) => ({
  id: t.id ?? '',
  name: t.name ?? '',
  show_headers: t.showHeaders ?? true,
  show_totals: t.showTotals ?? false,
  style: t.style ?? '',
});

// --- Table Column ---

export const tableColumnSchema = z.object({
  id: z.string().describe('Column ID'),
  name: z.string().describe('Column name'),
  index: z.number().int().describe('Zero-based column index within the table'),
});

export interface RawTableColumn {
  id?: string;
  name?: string;
  index?: number;
}

export const mapTableColumn = (c: RawTableColumn) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  index: c.index ?? 0,
});

// --- Table Row ---

export const tableRowSchema = z.object({
  index: z.number().int().describe('Zero-based row index within the table'),
  values: z.array(z.array(z.unknown())).describe('2D array with a single row of cell values'),
});

export interface RawTableRow {
  index?: number;
  values?: unknown[][];
}

export const mapTableRow = (r: RawTableRow) => ({
  index: r.index ?? 0,
  values: r.values ?? [],
});

// --- Named Item ---

export const namedItemSchema = z.object({
  name: z.string().describe('Named item name'),
  type: z.string().describe('Named item type (e.g., "Range", "String", "Integer")'),
  value: z.string().describe('Named item value or formula'),
  visible: z.boolean().describe('Whether the named item is visible'),
});

export interface RawNamedItem {
  name?: string;
  type?: string;
  value?: unknown;
  visible?: boolean;
}

export const mapNamedItem = (n: RawNamedItem) => ({
  name: n.name ?? '',
  type: n.type ?? '',
  value: String(n.value ?? ''),
  visible: n.visible ?? true,
});

// --- Chart ---

export const chartSchema = z.object({
  id: z.string().describe('Chart ID'),
  name: z.string().describe('Chart name'),
  height: z.number().describe('Chart height in points'),
  width: z.number().describe('Chart width in points'),
  top: z.number().describe('Distance from top of worksheet in points'),
  left: z.number().describe('Distance from left of worksheet in points'),
});

export interface RawChart {
  id?: string;
  name?: string;
  height?: number;
  width?: number;
  top?: number;
  left?: number;
}

export const mapChart = (c: RawChart) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  height: c.height ?? 0,
  width: c.width ?? 0,
  top: c.top ?? 0,
  left: c.left ?? 0,
});

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  display_name: z.string().describe('User display name'),
  email: z.string().describe('User email address'),
});

// --- Workbook info (from URL context) ---

export const workbookInfoSchema = z.object({
  drive_id: z.string().describe('OneDrive drive ID'),
  item_id: z.string().describe('Workbook item ID'),
  name: z.string().describe('Workbook file name'),
});

// --- Graph list response ---

export interface GraphListResponse<T> {
  value?: T[];
}
