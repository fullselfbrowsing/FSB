/**
 * Schema Bridge: CJS tool-definitions.js -> ESM MCP server
 *
 * Bridges the CommonJS tool-definitions.js (shared registry) into the ESM
 * MCP server using createRequire(). Provides:
 *
 * 1. Typed re-exports of TOOL_REGISTRY and helpers
 * 2. jsonSchemaToZod() converter for server.tool() registration
 * 3. PARAM_TRANSFORMS map for MCP-to-FSB parameter name mappings
 *
 * @module schema-bridge
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Load CJS module via createRequire
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
// Node 18 compat: import.meta.dirname requires Node 21+, use fileURLToPath fallback
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolDefs = require(path.resolve(__dirname, '../../ai/tool-definitions.cjs'));

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface ToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolPropertySchema>;
    required: string[];
  };
  _route: 'content' | 'cdp' | 'background';
  _readOnly: boolean;
  _contentVerb: string | null;
  _cdpVerb: string | null;
  // Phase 243 BG-02: marks tools whose semantic intent is foreground focus
  // transfer (currently only switch_tab). Optional / additive.
  _forceForeground?: boolean;
  // Phase 245 D-05 / D-06: marks action tools that should produce a
  // change_report on response. Optional; absent === false.
  _emitChangeReport?: boolean;
}

// ---------------------------------------------------------------------------
// Typed re-exports from tool-definitions.js
// ---------------------------------------------------------------------------

export const TOOL_REGISTRY: ToolDefinition[] = toolDefs.TOOL_REGISTRY;
export const getToolByName: (name: string) => ToolDefinition | null = toolDefs.getToolByName;
export const getReadOnlyTools: () => ToolDefinition[] = toolDefs.getReadOnlyTools;
export const getToolsByRoute: (route: string) => ToolDefinition[] = toolDefs.getToolsByRoute;

// ---------------------------------------------------------------------------
// JSON Schema -> Zod converter
// ---------------------------------------------------------------------------

/**
 * Convert a JSON Schema inputSchema object into the Zod shape record
 * that McpServer.tool() expects as its third argument.
 *
 * Handles: string, number, integer, boolean, string enums, defaults, optionals.
 *
 * Phase 69 D-07: `paramDescriptions` optionally replaces a property's
 * description text (MCP-only wording from ./descriptions.ts). Only the
 * `.describe()` argument changes; without the map the output is unchanged.
 */
export function jsonSchemaToZod(
  inputSchema: ToolDefinition['inputSchema'],
  paramDescriptions?: Readonly<Record<string, string>>,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required = new Set(inputSchema.required || []);

  for (const [key, prop] of Object.entries(inputSchema.properties)) {
    let zodType: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':
        zodType = prop.enum
          ? z.enum(prop.enum as [string, ...string[]])
          : z.string();
        break;
      case 'number':
        // Phase 260516-mq4: coerce string-encoded JSON numbers (Claude Code's
        // MCP transport stringifies numbers). z.preprocess maps "" -> NaN so
        // .finite() rejects empty strings (Number("") === 0 ambiguity).
        zodType = z.preprocess(
          (v) => (v === '' ? NaN : v),
          z.coerce.number().finite(),
        );
        break;
      case 'integer':
        // Phase 260516-mq4: same coercion + .int() to reject fractional strings.
        zodType = z.preprocess(
          (v) => (v === '' ? NaN : v),
          z.coerce.number().int().finite(),
        );
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      default:
        zodType = z.any();
    }

    const override = paramDescriptions && Object.prototype.hasOwnProperty.call(paramDescriptions, key)
      ? paramDescriptions[key]
      : undefined;
    const description = (typeof override === 'string' && override.length > 0) ? override : prop.description;
    if (description) {
      zodType = zodType.describe(description);
    }

    if (prop.default !== undefined) {
      zodType = zodType.default(prop.default);
    }

    if (!required.has(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Parameter transforms (MCP param names -> FSB internal param names)
// ---------------------------------------------------------------------------

/**
 * Transforms for tools where MCP parameter names differ from FSB internal names.
 *
 * press_key: MCP {key, ctrl, shift, alt} -> FSB {key, ctrlKey, shiftKey, altKey, useDebuggerAPI}
 * drag_drop: MCP {sourceSelector, targetSelector} -> FSB {sourceRef, targetRef}
 * click_at: MCP {shift, ctrl, alt} -> FSB {shiftKey, ctrlKey, altKey}
 * drag: MCP {shift, ctrl, alt} -> FSB {shiftKey, ctrlKey, altKey}
 * fill_sheet: MCP {csvData} -> FSB {data}
 *
 * Phase 246 D-14: every transform forwards tab_id verbatim when the caller
 * provides it. Without this, the rebuild-from-scratch path silently drops
 * tab_id and multi-tab agents hit AMBIGUOUS_TAB even when they pass it
 * (RESEARCH.md Pitfall 1).
 */
export const PARAM_TRANSFORMS: Record<
  string,
  (params: Record<string, unknown>) => Record<string, unknown>
> = {
  press_key: (p) => ({
    key: p.key,
    ctrlKey: p.ctrl ?? false,
    shiftKey: p.shift ?? false,
    altKey: p.alt ?? false,
    useDebuggerAPI: true,
    ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}),
  }),
  drag_drop: (p) => ({
    sourceRef: p.sourceSelector,
    targetRef: p.targetSelector,
    steps: p.steps,
    holdMs: p.holdMs,
    stepDelayMs: p.stepDelayMs,
    ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}),
  }),
  click_at: (p) => ({
    x: p.x,
    y: p.y,
    shiftKey: p.shift ?? false,
    ctrlKey: p.ctrl ?? false,
    altKey: p.alt ?? false,
    ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}),
  }),
  drag: (p) => ({
    startX: p.startX,
    startY: p.startY,
    endX: p.endX,
    endY: p.endY,
    steps: p.steps,
    stepDelayMs: p.stepDelayMs,
    shiftKey: p.shift ?? false,
    ctrlKey: p.ctrl ?? false,
    altKey: p.alt ?? false,
    ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}),
  }),
  fill_sheet: (p) => ({
    startCell: p.startCell,
    data: p.csvData,
    sheetName: p.sheetName,
    ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}),
  }),
};
