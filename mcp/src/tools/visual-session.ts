// Approved visual-session client labels (must match the extension's allowlist)
const MCP_VISUAL_CLIENT_LABELS: string[] = [
  'Claude', 'Codex', 'ChatGPT', 'Perplexity',
  'Cursor', 'Antigravity', 'OpenCode', 'OpenClaw', 'OpenClaw 🦀', 'Grok', 'Gemini', 'Hermes',
  // Other MCP clients
  'Cline', 'Continue', 'Zed', 'VS Code', 'Copilot',
  'JetBrains', 'Xcode', 'Eclipse', 'Cody', 'Roo Code', 'Kiro', 'Goose',
  // Always-on agents
  'Muse', 'Grok Bot', 'Dots',
];

const CLIENT_LABEL_MAP: Record<string, string> = Object.create(null);
for (const label of MCP_VISUAL_CLIENT_LABELS) {
  CLIENT_LABEL_MAP[label.toLowerCase().replace(/[\s_-]+/g, '')] = label;
}

export function normalizeMcpVisualClientLabel(raw: unknown): string | null {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return key ? (CLIENT_LABEL_MAP[key] ?? null) : null;
}

/**
 * Phase 255 Plan 03: boolean-returning wrapper consumed by the
 * action-tool dispatch validator in mcp/src/tools/manual.ts. Returns
 * true iff `raw` normalises to a label on the v0.9.36 shared allowlist.
 */
export function isAllowedMcpVisualClientLabel(raw: unknown): boolean {
  return normalizeMcpVisualClientLabel(raw) !== null;
}

export function getAllowedMcpVisualClientLabels(): string[] {
  return MCP_VISUAL_CLIENT_LABELS.slice();
}
