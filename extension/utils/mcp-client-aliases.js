(function(global) {
  'use strict';

  var MCP_CLIENT_ALIASES = Object.freeze({
    claude: 'claude-code',
    claudecode: 'claude-code',
    anthropicclaude: 'claude-code',
    claudedesktop: 'claude-desktop',
    cursor: 'cursor',
    visualstudiocode: 'vscode',
    vscode: 'vscode',
    antigravity: 'antigravity',
    googleantigravity: 'antigravity',
    codex: 'codex',
    openaicodex: 'codex',
    codexcli: 'codex',
    opencode: 'opencode',
    opencodecli: 'opencode',
    cline: 'cline',
    // Cline's SDK-based clients, such as the Cline CLI, identify as the SDK package.
    '@cline/core': 'cline',
    openclaw: 'openclaw'
  });

  function normalizeMcpClientName(name) {
    return String(name).trim().toLowerCase().replace(/[\s_-]+/g, '');
  }

  function resolveMcpClientAlias(name) {
    var normalized = normalizeMcpClientName(name);
    return Object.prototype.hasOwnProperty.call(MCP_CLIENT_ALIASES, normalized)
      ? MCP_CLIENT_ALIASES[normalized]
      : null;
  }

  global.FsbMcpClientAliases = Object.freeze({
    normalizeMcpClientName: normalizeMcpClientName,
    resolveMcpClientAlias: resolveMcpClientAlias
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
