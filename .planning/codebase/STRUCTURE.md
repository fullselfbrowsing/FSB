# Codebase Structure

**Analysis Date:** 2026-02-03

## Directory Layout

```
FSB/
├── .claude/                    # Claude AI configuration
├── .git/                       # Git version control
├── .planning/                  # GSD planning documents
│   ├── codebase/               # Codebase analysis docs (this file)
│   └── debug/                  # Debug session logs
│       └── resolved/           # Resolved debug issues
├── Assets/                     # Extension icons and images
├── Logs/                       # Runtime session logs
├── Research/                   # Research and reference materials
├── manifest.json               # Extension manifest (MV3)
├── background.js               # Service worker (main orchestrator)
├── content.js                  # Content script (DOM interaction)
├── ai-integration.js           # AI communication layer
├── universal-provider.js       # Multi-provider AI adapter
├── ai-providers.js             # Provider factory
├── config.js                   # Configuration management
├── secure-config.js            # Encrypted config storage
├── init-config.js              # Config initialization
├── analytics.js                # Usage tracking and cost calculation
├── automation-logger.js        # Structured logging system
├── keyboard-emulator.js        # Keyboard input simulation
├── dom-state-manager.js        # DOM change tracking (deprecated, inlined in content.js)
├── action-verification.js      # Action result verification
├── setup.js                    # Extension setup utilities
├── popup.html                  # Popup UI markup
├── popup.js                    # Popup UI logic
├── popup.css                   # Popup UI styles
├── sidepanel.html              # Side panel UI markup
├── sidepanel.js                # Side panel UI logic
├── sidepanel.css               # Side panel UI styles
├── options.html                # Options page markup
├── options.js                  # Options page logic
├── options.css                 # Options page styles
├── unlock.html                 # Encrypted config unlock page
├── unlock.js                   # Unlock page logic
├── chart.min.js                # Chart.js library for analytics
├── CLAUDE.md                   # Project documentation for Claude
├── README.md                   # Project documentation
└── package.json                # NPM package metadata
```

## Directory Purposes

**Root Directory:**
- Purpose: All primary extension source files
- Contains: JavaScript modules, HTML pages, CSS styles, manifest
- Key files: `background.js`, `content.js`, `ai-integration.js`, `manifest.json`

**Assets/:**
- Purpose: Extension branding and icons
- Contains: PNG icons at various sizes (16, 48, 128), logo variants (light/dark)
- Key files: `icon16.png`, `icon48.png`, `icon128.png`, `fsb_logo_dark.png`, `fsb_logo_light.png`

**.planning/:**
- Purpose: GSD (Get Stuff Done) planning and analysis documents
- Contains: Codebase analysis, debug logs
- Key files: `codebase/ARCHITECTURE.md`, `codebase/STRUCTURE.md`

**Logs/:**
- Purpose: Runtime automation session logs
- Contains: JSON log files with session data
- Generated: Automatically during automation runs

**Research/:**
- Purpose: Reference materials and research notes
- Contains: Documentation, API references
- Generated: Manually by developers

## Key File Locations

**Entry Points:**
- `manifest.json`: Extension configuration, permissions, script registration
- `background.js`: Service worker entry, loads all background modules
- `popup.html`: Popup UI entry, loaded on extension icon click
- `sidepanel.html`: Side panel UI entry
- `options.html`: Options page entry

**Configuration:**
- `config.js`: Main configuration class with defaults and storage methods
- `secure-config.js`: Encryption utilities for API keys
- `init-config.js`: Migration and initialization helpers
- `manifest.json`: Permissions, content script matching, icons

**Core Logic:**
- `background.js`: Session management, automation loop, message handling (~4900 lines)
- `content.js`: DOM analysis, action execution, tools (~5600 lines)
- `ai-integration.js`: AI prompts, response parsing, caching (~2800 lines)
- `universal-provider.js`: Multi-provider API adapter (~800 lines)
- `extension/content/skopeo-context-router.js`: Closed, render-independent Drive/Docs context classification and context-epoch ownership

**Testing:**
- No dedicated test directory
- Manual testing via extension in browser
- Debug logging via `automation-logger.js`

## Naming Conventions

**Files:**
- `kebab-case.js`: Multi-word JavaScript modules (e.g., `ai-integration.js`, `secure-config.js`)
- `lowercase.js`: Single-word modules (e.g., `config.js`, `analytics.js`)
- `page.html/js/css`: UI pages use consistent naming (e.g., `popup.html`, `popup.js`, `popup.css`)

**Directories:**
- `PascalCase/`: Asset and document directories (e.g., `Assets/`, `Logs/`, `Research/`)
- `.lowercase/`: Hidden/config directories (e.g., `.planning/`, `.claude/`)

**Classes:**
- `PascalCase`: Class names (e.g., `AIIntegration`, `Config`, `DOMStateManager`, `FSBAnalytics`)

**Functions:**
- `camelCase`: Function names (e.g., `handleStartAutomation`, `getStructuredDOM`, `calculateActionDelay`)

**Constants:**
- `SCREAMING_SNAKE_CASE`: Constants and enums (e.g., `FAILURE_TYPES`, `TOOL_DOCUMENTATION`, `TASK_PROMPTS`)

## Where to Add New Code

**New Feature:**
- Primary code: Add to existing module or create new `.js` file in root
- Background functionality: Extend `background.js` or create importable module
- DOM/page interaction: Extend `content.js` `tools` object
- Tests: Manual testing, add debug logging

**New UI Page:**
- Create `pagename.html`, `pagename.js`, `pagename.css` in root
- Register in `manifest.json` if needed (e.g., for options_page)
- Follow patterns from `popup.js` or `sidepanel.js`

**New AI Provider:**
- Add configuration to `PROVIDER_CONFIGS` in `universal-provider.js`
- Add model pricing to `analytics.js` and `background.js` `BackgroundAnalytics`
- Add model options to `config.js` `availableModels` and `options.js` `availableModels`

**New Browser Action Tool:**
- Add function to `tools` object in `content.js` (~line 1755)
- Add documentation to `TOOL_DOCUMENTATION` in `ai-integration.js`
- Tool signature: `toolName: async (params) => { return { success: boolean, ...data }; }`

**Utilities:**
- Shared helpers: Add to relevant module or create dedicated util file
- Logging: Use `automationLogger` methods from `automation-logger.js`

## Special Directories

**Assets/:**
- Purpose: Extension icons and branding images
- Generated: No (manually created)
- Committed: Yes

**Logs/:**
- Purpose: Runtime session log files
- Generated: Yes (during automation)
- Committed: No (in .gitignore)

**.planning/:**
- Purpose: GSD planning documents
- Generated: Yes (by GSD tools)
- Committed: Yes

**Research/:**
- Purpose: Developer reference materials
- Generated: No (manually added)
- Committed: Varies (check .gitignore)

## File Size Reference

Large files that may need refactoring:
- `content.js`: ~226KB (~5600 lines) - DOM analysis + all action tools
- `background.js`: ~175KB (~4900 lines) - Session management + automation loop
- `ai-integration.js`: ~107KB (~2800 lines) - AI prompts + parsing
- `options.js`: ~69KB - Settings UI logic
- `chart.min.js`: ~205KB - Third-party library (minified)

## Import/Dependency Graph

```
manifest.json
  └─> background.js (service_worker)
        ├─> config.js (importScripts)
        ├─> init-config.js (importScripts)
        ├─> ai-integration.js (importScripts)
        │     └─> ai-providers.js (importScripts)
        ├─> automation-logger.js (importScripts)
        ├─> analytics.js (importScripts)
        └─> keyboard-emulator.js (importScripts)

  └─> content.js (content_scripts)
        └─> automation-logger.js (injected together)

  └─> popup.html
        └─> popup.js (script tag)
              └─> analytics.js (script tag in HTML)

  └─> sidepanel.html
        └─> sidepanel.js (script tag)
              └─> analytics.js (script tag in HTML)

  └─> options.html
        └─> options.js (script tag)
              ├─> analytics.js (script tag in HTML)
              └─> chart.min.js (script tag in HTML)
```

---

*Structure analysis: 2026-02-03*
