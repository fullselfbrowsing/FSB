/**
 * Configuration management for FSB
 * This file handles loading configuration from environment variables and Chrome storage
 */

/**
 * Configuration manager class for FSB extension
 * @class
 */
class Config {
  /**
   * Creates an instance of Config with default settings
   */
  constructor() {
    // Default configuration - Multi-model support
    this.defaults = {
      // Model configuration
      providerKind: 'api', // api or agent; exact routing is resolved by delegation preflight
      agentProviderId: '', // latent agent selection; empty remains the canonical legacy value
      modelProvider: 'xai', // xai, gemini, openai, anthropic, openrouter, lmstudio, custom
      modelName: 'grok-4-1-fast', // Current selected model - fast and efficient for automation
      
      // API Keys
      apiKey: '', // xAI API key (for Grok models)
      geminiApiKey: '', // Google Gemini API key
      openaiApiKey: '', // OpenAI API key
      anthropicApiKey: '', // Anthropic API key
      openrouterApiKey: '', // OpenRouter API key
      customApiKey: '', // Custom OpenAI-compatible API key
      customEndpoint: '', // Custom OpenAI-compatible endpoint
      lmstudioBaseUrl: 'http://localhost:1234', // LM Studio local server URL

      // Legacy support
      speedMode: 'normal', // Deprecated - use modelName instead

      // Automation settings
      maxIterations: 100,
      debugMode: false,

      // DOM Optimization settings
      domOptimization: true,
      maxDOMElements: 2000,
      elementCacheSize: 200,
      prioritizeViewport: true,
      animatedActionHighlights: true,
      showSidepanelProgress: false,
      fsbJevFastModeEnabled: false, // Phase 68: autopilot fast mode, off by default

      // Credential Manager (Beta)
      enableLogin: false,
      enableSavedPayments: false,

      // CAPTCHA Solver
      captchaSolverEnabled: false,
      captchaApiKey: '',

      // Background Agents Server
      serverUrl: 'https://fsb-server.fly.dev',
      serverHashKey: '',
      serverSyncEnabled: false
    };

    // PERF: In-memory config cache with TTL to avoid repeated chrome.storage reads
    this._cachedConfig = null;
    this._cacheTimestamp = 0;
    this._cacheTTL = 10000; // 10 seconds

    // Invalidate cache when storage changes externally
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          this._cachedConfig = null;
          this._cacheTimestamp = 0;
        }
      });
    }

    // Chrome extensions use storage API instead of environment variables
    
    // Available models configuration
    this.availableModels = {
      xai: [
        { id: 'grok-4-1-fast', name: 'Grok 4.1 Fast', description: 'High-speed with reasoning, 2M context (Recommended)' },
        { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast Non-Reasoning', description: 'Without reasoning for faster responses' },
        { id: 'grok-4', name: 'Grok 4', description: 'Complex reasoning model' },
        { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', description: 'Dedicated code generation & debugging' },
        { id: 'grok-3', name: 'Grok 3', description: 'Legacy flagship model' },
        { id: 'grok-3-mini', name: 'Grok 3 Mini', description: 'Budget option with reasoning' }
      ],
      gemini: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Latest with thinking capabilities' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Budget option with 1M context' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Most powerful with 2M context' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Experimental', description: 'FREE experimental until May 2025' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast and efficient' }
      ],
      openai: [
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable multimodal model' },
        { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', description: 'Always newest GPT-4o version' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Affordable and fast, better than GPT-3.5' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation flagship' }
      ],
      anthropic: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: 'Most powerful reasoning model' },
        { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', description: 'Previous Opus flagship' },
        { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', description: 'Opus 4.1 model' },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Opus 4 model' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Latest balanced model' },
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Previous Sonnet flagship' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Sonnet 4 model' },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast and cost-effective' },
        { id: 'claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', description: 'Legacy fast model' }
      ],
      openrouter: [
        { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', description: 'OpenAI GPT-4o routed through OpenRouter' },
        { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (via OpenRouter)', description: 'Anthropic Claude via OpenRouter' },
        { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)', description: 'Google Gemini via OpenRouter' },
        { id: 'x-ai/grok-4-1-fast', name: 'Grok 4.1 Fast (via OpenRouter)', description: 'xAI Grok via OpenRouter' },
        { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (via OpenRouter)', description: 'Meta Llama 4 via OpenRouter' },
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (via OpenRouter)', description: 'DeepSeek reasoning model via OpenRouter' }
      ],
      lmstudio: []
    };
  }
  
  /**
   * Loads configuration from Chrome storage
   * @returns {Promise<Object>} Complete configuration object with defaults applied
   */
  async loadFromStorage() {
    // PERF: Return cached config if still fresh
    if (this._cachedConfig && (Date.now() - this._cacheTimestamp) < this._cacheTTL) {
      return { ...this._cachedConfig };
    }

    const config = { ...this.defaults };

    try {
      // Load settings from Chrome storage
      const stored = await chrome.storage.local.get(Object.keys(this.defaults));
      Object.assign(config, stored);

      // Validate and auto-correct model name if invalid
      const correctedModel = this.validateAndCorrectModel(config.modelName, config.modelProvider);
      if (correctedModel !== config.modelName) {
        console.warn(`[Config] Invalid model name "${config.modelName}" auto-corrected to "${correctedModel}"`);
        config.modelName = correctedModel;
        // Save the corrected value back to storage
        await chrome.storage.local.set({ modelName: correctedModel });
      }

    } catch (error) {
      console.error('Error loading config from Chrome storage:', error);
    }

    // Update cache
    this._cachedConfig = { ...config };
    this._cacheTimestamp = Date.now();

    return config;
  }

  /**
   * Validates model name and returns corrected version if invalid
   * @param {string} modelName - The model name to validate
   * @param {string} provider - The model provider (xai, gemini, openai, anthropic)
   * @returns {string} Valid model name (corrected if necessary)
   */
  validateAndCorrectModel(modelName, provider = 'xai') {
    // OpenAI-compatible local/custom providers accept arbitrary model IDs.
    if (provider === 'lmstudio' || provider === 'custom') {
      return modelName || '';
    }

    // Default fallbacks per provider (used when modelName is empty/missing)
    const defaultModels = Config.DEFAULT_MODELS;

    // Empty/missing modelName -> per-provider default (existing behavior)
    if (!modelName) {
      console.warn(`[Config] Model "${modelName}" is not valid for provider "${provider}"`);
      return defaultModels[provider] || 'grok-4-1-fast';
    }

    // Build the union of (a) hardcoded FALLBACK_MODELS and (b) the live
    // discovery cache. Phase 228/Plan 03: this lets a freshly-discovered
    // model id (one the user picked from the populated dropdown) survive
    // a config reload without being silently rewritten back to the default.
    const validIds = new Set();
    const validModels = this.availableModels[provider] || [];
    for (const m of validModels) validIds.add(m.id);

    if (typeof globalThis !== 'undefined' && typeof globalThis.getDiscoveredModelIds === 'function') {
      try {
        const discovered = globalThis.getDiscoveredModelIds(provider) || [];
        for (const id of discovered) validIds.add(id);
      } catch (_) { /* discovery lookup is best-effort */ }
    }

    if (validIds.has(modelName)) {
      return modelName;
    }

    // Legacy known-bad xAI ids -- preserved exactly. These are explicit
    // migrations from deprecated/renamed model ids; they apply even when
    // the discovery cache is populated, because the user almost certainly
    // saved one of these from a past extension version (not from a fresh
    // pick) and routing to a non-existent endpoint would just 404.
    const xaiCorrections = {
      'grok-3-fast': 'grok-4-1-fast',
      'grok-3-fast-beta': 'grok-4-1-fast',
      'grok-3-mini-fast-beta': 'grok-4-1-fast',
      'grok-3-mini-beta': 'grok-3-mini',
      'grok-3-mini-fast': 'grok-4-1-fast',
      'grok-4-fast': 'grok-4-1-fast',
      'grok-4-1': 'grok-4',  // grok-4-1 doesn't exist, map to grok-4
      'grok-beta': 'grok-3'
    };

    if (provider === 'xai' && xaiCorrections[modelName]) {
      console.warn(`[Config] Model "${modelName}" is not valid for provider "${provider}"`);
      return xaiCorrections[modelName];
    }

    // NEW (Plan 03): preserve user choice instead of silently rewriting.
    // The user may have picked a freshly-discovered id whose cache entry
    // was lost across an extension reload (service worker restarts clear
    // the in-memory _cache). Rewriting to the default would undo the
    // user's selection. Next discovery run will repopulate the cache;
    // until then the saved id flows straight through to ai-integration.
    console.warn(`[Config] Model "${modelName}" not in hardcoded list or discovery cache for provider "${provider}"; preserving user choice for re-validation on next discovery.`);
    return modelName;
  }
  
  // Check if running in development mode
  isDevelopment() {
    return !('update_url' in chrome.runtime.getManifest());
  }
  
  // Get API key based on current provider
  async getApiKey(provider = null) {
    const config = await this.loadFromStorage();
    const currentProvider = provider || config.modelProvider;
    const keyMap = {
      xai: config.apiKey,
      gemini: config.geminiApiKey,
      openai: config.openaiApiKey,
      anthropic: config.anthropicApiKey,
      openrouter: config.openrouterApiKey,
      lmstudio: '',
      custom: config.customApiKey
    };
    if (Object.prototype.hasOwnProperty.call(keyMap, currentProvider)) {
      return keyMap[currentProvider];
    }
    return config.apiKey;
  }
  
  // Legacy method - returns xAI key for backward compatibility
  async getXAIApiKey() {
    const config = await this.loadFromStorage();
    return config.apiKey;
  }
  
  // Get CAPTCHA API key (2Captcha)
  async getCaptchaApiKey() {
    const config = await this.loadFromStorage();
    return config.captchaApiKey || null;
  }
  
  // Save configuration to storage
  async save(newConfig) {
    try {
      // Invalidate cache before saving to ensure next read gets fresh data
      this._cachedConfig = null;
      this._cacheTimestamp = 0;
      await chrome.storage.local.set(newConfig);
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      return false;
    }
  }
  
  /**
   * Gets all configuration settings
   * @returns {Promise<Object>} Complete configuration object
   */
  async getAll() {
    return await this.loadFromStorage();
  }
  
  // Update specific configuration values
  async update(updates) {
    const current = await this.getAll();
    const updated = { ...current, ...updates };
    return await this.save(updated);
  }
}

// Per-provider default model ids. Shared by validateAndCorrectModel (an empty
// model name falls back to its provider's default) and the settings schema's
// write planner (a modelProvider change sets modelName to this default, D-15).
// lmstudio and custom stay empty: their model is resolved at start.
Config.DEFAULT_MODELS = Object.freeze({
  'xai': 'grok-4-1-fast',
  'gemini': 'gemini-2.5-flash',
  'openai': 'gpt-4o',
  'anthropic': 'claude-sonnet-4-6',
  'openrouter': 'openai/gpt-4o',
  'lmstudio': '',
  'custom': ''
});

// Export singleton instance
const config = new Config();

// For use in service workers
if (typeof self !== 'undefined') {
  self.config = config;
}

// For use in content scripts
if (typeof window !== 'undefined') {
  window.BrowserAgentConfig = config;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Config, config };
}

/**
 * Phase 66.1 settings schema: the single source of truth for MCP settings
 * reads and writes (D-08). Each entry names one chrome.storage.local key the
 * control panel writes, with its type, class (writable, secret or endpoint),
 * effective default and bounds or allowed values. Reads mask secrets and show
 * endpoints as origin only; parsing is strict and its errors never echo the
 * submitted value. Phase 68 adds its key as one entry.
 *
 * One IIFE: config.js shares the service worker's global lexical scope with
 * every importScripts file (and the panel scope with options.js), so this
 * block adds no top-level name. It reads no storage, calls no chrome.* API
 * and does not touch SW-only globals at load (config.js loads first).
 * planWrite reads Config.DEFAULT_MODELS and the config singleton's built-in
 * model list at call time only; the caller passes stored values and ctx in.
 */
(function (global) {
  'use strict';

  var CODES = Object.freeze({
    REQUEST_INVALID: 'SETTING_REQUEST_INVALID',
    UNKNOWN_KEY: 'SETTING_UNKNOWN_KEY',
    PROTECTED_KEY: 'SETTING_PROTECTED_KEY',
    VALUE_INVALID: 'SETTING_VALUE_INVALID',
    PROVIDER_NOT_READY: 'SETTING_PROVIDER_NOT_READY',
    DELEGATED_WRITE_REFUSED: 'SETTING_DELEGATED_WRITE_REFUSED',
    UNSUPPORTED: 'SETTING_UNSUPPORTED',
    STORAGE_FAILED: 'SETTING_STORAGE_FAILED'
  });

  var KEY_SOURCE = '^[A-Za-z][A-Za-z0-9_]{0,63}$';
  // Every check uses the private copy, so the exported pattern cannot be
  // tampered with to change what the schema accepts.
  var KEY_RE = new RegExp(KEY_SOURCE);
  var KEY_PATTERN = Object.freeze(new RegExp(KEY_SOURCE));
  var INTEGER_RE = /^[0-9]{1,6}$/;
  var VALUE_MAX_LENGTH = 2048;
  var MODEL_LIST_CAP = 25;
  var AGENT_CAP_FALLBACK = 8;
  var PROVIDERS = Object.freeze(['xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom']);
  var HOSTED_PROVIDERS = Object.freeze(['xai', 'gemini', 'openai', 'anthropic', 'openrouter']);
  // The stored API key each provider needs; mirrors Config.prototype.getApiKey
  // (a behavioural parity test pins it). lmstudio needs none.
  var PROVIDER_API_KEY = Object.freeze({
    xai: 'apiKey',
    gemini: 'geminiApiKey',
    openai: 'openaiApiKey',
    anthropic: 'anthropicApiKey',
    openrouter: 'openrouterApiKey',
    custom: 'customApiKey',
    lmstudio: null
  });
  var ALLOWED_ENTRY_MAX = 200;
  var UNKNOWN_KEY_SENTENCE = 'Unknown setting key. Call settings with no arguments to list keys.';

  var TYPES =['boolean', 'integer', 'enum', 'string'];
  var CLASSES = ['writable', 'secret', 'endpoint'];
  var GROUPS = ['provider'];
  var DEFAULT_SOURCES = ['agentCapRecommendation'];
  var ENTRY_FIELDS = ['key', 'type', 'cls', 'default', 'min', 'max', 'values', 'maxLength', 'group'];
  var TYPE_ONLY_FIELDS = { min: 'integer', max: 'integer', values: 'enum', maxLength: 'string' };

  // D-09 inventory: saveSettings' object order (options.js), then the four
  // other control-panel writers (autoAnalyzeMemories, fsbTelemetryOptOut and
  // the Sync keys). Defaults are the effective ones the consuming code uses
  // (D-12); Config.defaults above stays unchanged.
  var PRODUCTION_ENTRIES = [
    { key: 'providerKind', type: 'enum', cls: 'writable', default: 'api', values: ['api', 'agent'], group: 'provider' },
    { key: 'agentProviderId', type: 'string', cls: 'writable', default: '', maxLength: 64, group: 'provider' },
    { key: 'modelProvider', type: 'enum', cls: 'writable', default: 'xai', values: PROVIDERS, group: 'provider' },
    { key: 'modelName', type: 'string', cls: 'writable', default: 'grok-4-1-fast', maxLength: 200, group: 'provider' },
    { key: 'apiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'geminiApiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'openaiApiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'anthropicApiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'customApiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'customEndpoint', type: 'string', cls: 'endpoint', default: '' },
    { key: 'openrouterApiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'lmstudioBaseUrl', type: 'string', cls: 'endpoint', default: 'http://localhost:1234' },
    { key: 'maxIterations', type: 'integer', cls: 'writable', default: 100, min: 50, max: 500 },
    { key: 'debugMode', type: 'boolean', cls: 'writable', default: false },
    { key: 'domOptimization', type: 'boolean', cls: 'writable', default: true },
    { key: 'maxDOMElements', type: 'integer', cls: 'writable', default: 2000, min: 500, max: 5000 },
    { key: 'elementCacheSize', type: 'integer', cls: 'writable', default: 200, min: 10, max: 1000 },
    { key: 'prioritizeViewport', type: 'boolean', cls: 'writable', default: true },
    { key: 'animatedActionHighlights', type: 'boolean', cls: 'writable', default: true },
    // Effective default: the side panel reads `?? true` (Config.defaults says false).
    { key: 'showSidepanelProgress', type: 'boolean', cls: 'writable', default: true },
    { key: 'enableLogin', type: 'boolean', cls: 'writable', default: false },
    { key: 'captchaSolverEnabled', type: 'boolean', cls: 'writable', default: false },
    { key: 'captchaApiKey', type: 'string', cls: 'secret', default: '' },
    { key: 'sttProvider', type: 'enum', cls: 'writable', default: 'browser', values: ['browser', 'whisper'] },
    { key: 'voiceInputEnabled', type: 'boolean', cls: 'writable', default: true },
    { key: 'autoRefineSiteMaps', type: 'boolean', cls: 'writable', default: true },
    // Computed default: FsbAgentCapRecommendation, passed in through ctx at call time.
    { key: 'fsbAgentCap', type: 'integer', cls: 'writable', default: { from: 'agentCapRecommendation' }, min: 1, max: 64 },
    { key: 'fsbTriggerCap', type: 'integer', cls: 'writable', default: 8, min: 1, max: 64 },
    { key: 'fsbChangeReportsEnabled', type: 'boolean', cls: 'writable', default: true },
    { key: 'fsbMcpSessionRecordingEnabled', type: 'boolean', cls: 'writable', default: true },
    { key: 'fsbMcpSessionRetentionDays', type: 'integer', cls: 'writable', default: 30, min: 1, max: 365 },
    { key: 'autoAnalyzeMemories', type: 'boolean', cls: 'writable', default: true },
    { key: 'fsbTelemetryOptOut', type: 'boolean', cls: 'writable', default: false },
    // Effective default: ws-client.js and the panel Sync use this host (Config.defaults says fly.dev).
    { key: 'serverUrl', type: 'string', cls: 'endpoint', default: 'https://full-selfbrowsing.com' },
    { key: 'serverHashKey', type: 'string', cls: 'secret', default: '' },
    // Phase 68 (AUTO-01): the autopilot fast mode switch, off by default.
    { key: 'fsbJevFastModeEnabled', type: 'boolean', cls: 'writable', default: false }
  ];

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isStored(stored, key) {
    return stored !== null && typeof stored === 'object' && hasOwn(stored, key) && stored[key] !== undefined;
  }

  function safeKeyLabel(key) {
    return (typeof key === 'string' && KEY_RE.test(key)) ? key : '[invalid]';
  }

  // D-11 read projection: scheme://host[:port], '/...' when more existed,
  // '[set]' when unparseable or opaque, '' when empty. Userinfo, path, query
  // and fragment never appear.
  function originOnly(raw) {
    if (typeof raw !== 'string' || raw === '') return '';
    var parsed;
    try {
      parsed = new URL(raw);
    } catch (_e) {
      return '[set]';
    }
    var origin = parsed.origin;
    if (typeof origin !== 'string' || origin === '' || origin === 'null') return '[set]';
    var more = (parsed.pathname !== '' && parsed.pathname !== '/') || parsed.search !== '' || parsed.hash !== '';
    return more ? origin + '/...' : origin;
  }

  // Failure object shared by parse and plan. `error` is value-free: it names
  // the key only through safeKeyLabel, plus bounds or allowed values.
  function failure(code, key, error, extra) {
    var out = { ok: false, code: code, error: error, key: safeKeyLabel(key) };
    if (extra && extra.range) out.range = { min: extra.range.min, max: extra.range.max };
    if (extra && extra.values) out.values = extra.values.slice();
    return out;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value !== '';
  }

  function storedNonBlank(stored, key) {
    return isStored(stored, key) && typeof stored[key] === 'string' && stored[key].trim() !== '';
  }

  function isHostedProvider(provider) {
    return typeof provider === 'string' && HOSTED_PROVIDERS.indexOf(provider) !== -1;
  }

  // The allowed-values text of an invalid-value error (D-07). It reads only
  // its three arguments, which come from the schema, the built-in model list,
  // the discovery cache and the shipped agent ids; it never sees the raw input.
  function formatAllowed(spec) {
    var parts = [];
    var range = spec !== null && typeof spec === 'object' ? spec.range : undefined;
    if (range !== null && typeof range === 'object' && isFiniteNumber(range.min) && isFiniteNumber(range.max)) {
      parts.push(String(range.min) + ' to ' + String(range.max));
    }
    var values = spec !== null && typeof spec === 'object' ? spec.values : undefined;
    if (Array.isArray(values)) {
      var rendered = [];
      for (var i = 0; i < values.length; i += 1) {
        var value = values[i];
        if (typeof value !== 'string' && !isFiniteNumber(value)) continue;
        var text = String(value);
        rendered.push(text === '' ? '""' : text.slice(0, ALLOWED_ENTRY_MAX));
      }
      var list = rendered.join(', ');
      var omitted = spec.omitted;
      if (Number.isInteger(omitted) && omitted > 0) {
        list = list === '' ? '(+' + omitted + ' more)' : list + ' (+' + omitted + ' more)';
      }
      if (list !== '') parts.push(list);
    }
    return parts.join('; ');
  }

  // planWrite's failure path: an invalid-value failure that carries a range or
  // allowed values says what is allowed in its own sentence. parseValue's own
  // failures stay as they are; no other code gets the clause.
  function withAllowedClause(result, omitted) {
    if (!result || result.ok !== false || result.code !== CODES.VALUE_INVALID) return result;
    if (!result.range && !result.values) return result;
    var allowed = formatAllowed({ range: result.range, values: result.values, omitted: omitted });
    if (allowed !== '') result.error = result.error + ' Allowed: ' + allowed + '.';
    return result;
  }

  // Built-in ids from the config singleton declared above this block, read at
  // call time (never at load), then the given discovered ids; de-duplicated,
  // in order. Only hosted providers have a known list.
  function knownModelIds(provider, discoveredIds) {
    if (!isHostedProvider(provider)) return [];
    var ids = [];
    function add(id) {
      if (isNonEmptyString(id) && ids.indexOf(id) === -1) ids.push(id);
    }
    var available = (typeof config !== 'undefined' && config && config.availableModels) ? config.availableModels : null;
    var builtIn = available && hasOwn(available, provider) && Array.isArray(available[provider]) ? available[provider] : [];
    for (var b = 0; b < builtIn.length; b += 1) add(builtIn[b] && builtIn[b].id);
    if (Array.isArray(discoveredIds)) {
      for (var d = 0; d < discoveredIds.length; d += 1) add(discoveredIds[d]);
    }
    return ids;
  }

  // The getDiscoveredModelIds rule (extension/ai/model-discovery.js) applied
  // to the persisted fsbDiscoveryCache object: the SW's in-memory copy is
  // hydrated once and misses discoveries the panel ran later (Pitfall 7).
  // Entries keyed '<provider>:...', not expired, ok:true with a models array;
  // the last qualifying entry in object order wins.
  function discoveredIdsFromCache(cacheObject, provider, nowMs) {
    if (cacheObject === null || typeof cacheObject !== 'object' || Array.isArray(cacheObject)) return [];
    if (!isNonEmptyString(provider)) return [];
    var prefix = provider + ':';
    var best = null;
    var cacheKeys = Object.keys(cacheObject);
    for (var i = 0; i < cacheKeys.length; i += 1) {
      if (cacheKeys[i].indexOf(prefix) !== 0) continue;
      var entry = cacheObject[cacheKeys[i]];
      if (entry === null || typeof entry !== 'object') continue;
      if (!(entry.expiresAt > nowMs)) continue;
      var result = entry.result;
      if (result === null || typeof result !== 'object' || result.ok !== true || !Array.isArray(result.models)) continue;
      best = result.models;
    }
    if (!best) return [];
    var ids = [];
    for (var m = 0; m < best.length; m += 1) {
      var model = best[m];
      var id = String((model && model.id) || '');
      if (id !== '') ids.push(id);
    }
    return ids;
  }

  function invalidEntry(index, reason) {
    return new TypeError('FsbSettingsSchema entry ' + index + ': ' + reason);
  }

  // Validates one entry and returns a deep-frozen copy (the caller's object
  // is never frozen or kept).
  function buildEntry(raw, index, seen) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw invalidEntry(index, 'not an object');
    var fields = Object.keys(raw);
    for (var f = 0; f < fields.length; f += 1) {
      if (ENTRY_FIELDS.indexOf(fields[f]) === -1) throw invalidEntry(index, 'unknown field ' + fields[f]);
    }
    if (typeof raw.key !== 'string' || !KEY_RE.test(raw.key)) throw invalidEntry(index, 'invalid key');
    if (seen[raw.key]) throw invalidEntry(index, 'duplicate key ' + raw.key);
    if (TYPES.indexOf(raw.type) === -1) throw invalidEntry(index, 'unknown type');
    if (CLASSES.indexOf(raw.cls) === -1) throw invalidEntry(index, 'unknown class');
    if (raw.cls !== 'writable' && raw.type !== 'string') throw invalidEntry(index, 'secrets and endpoints are strings');
    if (raw.group !== undefined && GROUPS.indexOf(raw.group) === -1) throw invalidEntry(index, 'unknown group');
    var onlyFields = Object.keys(TYPE_ONLY_FIELDS);
    for (var o = 0; o < onlyFields.length; o += 1) {
      if (raw[onlyFields[o]] !== undefined && raw.type !== TYPE_ONLY_FIELDS[onlyFields[o]]) {
        throw invalidEntry(index, onlyFields[o] + ' is only for ' + TYPE_ONLY_FIELDS[onlyFields[o]] + ' entries');
      }
    }

    var entry = { key: raw.key, type: raw.type, cls: raw.cls, default: raw.default };
    if (raw.type === 'boolean') {
      if (typeof raw.default !== 'boolean') throw invalidEntry(index, 'boolean default must be a boolean');
    } else if (raw.type === 'integer') {
      if (!Number.isInteger(raw.min) || !Number.isInteger(raw.max) || raw.min > raw.max) {
        throw invalidEntry(index, 'integer bounds must be integers with min <= max');
      }
      if (raw.default !== null && typeof raw.default === 'object') {
        if (Object.keys(raw.default).length !== 1 || DEFAULT_SOURCES.indexOf(raw.default.from) === -1) {
          throw invalidEntry(index, 'unknown computed default');
        }
        if (AGENT_CAP_FALLBACK < raw.min || AGENT_CAP_FALLBACK > raw.max) {
          throw invalidEntry(index, 'computed default fallback is outside the bounds');
        }
        entry.default = Object.freeze({ from: raw.default.from });
      } else if (!Number.isInteger(raw.default) || raw.default < raw.min || raw.default > raw.max) {
        throw invalidEntry(index, 'integer default must be inside its bounds');
      }
      entry.min = raw.min;
      entry.max = raw.max;
    } else if (raw.type === 'enum') {
      if (!Array.isArray(raw.values) || raw.values.length === 0) throw invalidEntry(index, 'enum needs values');
      var values = [];
      for (var v = 0; v < raw.values.length; v += 1) {
        var value = raw.values[v];
        if (typeof value !== 'string' || value === '' || values.indexOf(value) !== -1) {
          throw invalidEntry(index, 'enum values must be unique non-empty strings');
        }
        values.push(value);
      }
      if (values.indexOf(raw.default) === -1) throw invalidEntry(index, 'enum default must be one of its values');
      entry.values = Object.freeze(values);
    } else {
      if (typeof raw.default !== 'string') throw invalidEntry(index, 'string default must be a string');
      if (raw.maxLength !== undefined) {
        if (!Number.isInteger(raw.maxLength) || raw.maxLength < 1 || raw.maxLength > VALUE_MAX_LENGTH) {
          throw invalidEntry(index, 'maxLength must be an integer from 1 to ' + VALUE_MAX_LENGTH);
        }
        entry.maxLength = raw.maxLength;
      }
    }
    if (raw.group !== undefined) entry.group = raw.group;
    return Object.freeze(entry);
  }

  // Shared by every instance, fixture instances included, so a test can put
  // a fixture instance on globalThis.FsbSettingsSchema and every consumer
  // keeps working.
  var STATICS = {
    CODES: CODES,
    KEY_PATTERN: KEY_PATTERN,
    VALUE_MAX_LENGTH: VALUE_MAX_LENGTH,
    PROVIDERS: PROVIDERS,
    MODEL_LIST_CAP: MODEL_LIST_CAP,
    HOSTED_PROVIDERS: HOSTED_PROVIDERS,
    PROVIDER_API_KEY: PROVIDER_API_KEY,
    safeKeyLabel: safeKeyLabel,
    originOnly: originOnly,
    knownModelIds: knownModelIds,
    discoveredIdsFromCache: discoveredIdsFromCache,
    formatAllowed: formatAllowed
  };

  function create(entries) {
    if (!Array.isArray(entries)) throw new TypeError('FsbSettingsSchema.create needs an array of entries');
    var byKey = Object.create(null);
    var list = [];
    for (var i = 0; i < entries.length; i += 1) {
      var built = buildEntry(entries[i], i, byKey);
      byKey[built.key] = built;
      list.push(built);
    }
    var frozenEntries = Object.freeze(list);

    function get(key) {
      if (typeof key !== 'string' || !KEY_RE.test(key)) return null;
      return byKey[key] || null;
    }

    function keys() {
      return frozenEntries.map(function (entry) { return entry.key; });
    }

    function isWritable(key) {
      var entry = get(key);
      return entry !== null && entry.cls === 'writable';
    }

    function readOnlyKeys() {
      return frozenEntries
        .filter(function (entry) { return entry.cls !== 'writable'; })
        .map(function (entry) { return entry.key; });
    }

    function effectiveDefault(key, ctx) {
      var entry = get(key);
      if (!entry) return undefined;
      var fallback = entry.default;
      if (fallback !== null && typeof fallback === 'object') {
        var recommended = (ctx !== null && typeof ctx === 'object') ? ctx.agentCapRecommendation : undefined;
        if (Number.isInteger(recommended) && recommended >= entry.min && recommended <= entry.max) return recommended;
        return AGENT_CAP_FALLBACK;
      }
      return fallback;
    }

    // Reads never write: `stored` is only inspected.
    function projectValue(key, stored, ctx) {
      var entry = get(key);
      if (!entry) return undefined;
      var has = isStored(stored, entry.key);
      if (entry.cls === 'secret') {
        var secret = has ? stored[entry.key] : '';
        return (typeof secret === 'string' && secret.trim() !== '') ? '[set]' : '';
      }
      if (entry.cls === 'endpoint') {
        return originOnly(has ? stored[entry.key] : effectiveDefault(entry.key, ctx));
      }
      return has ? stored[entry.key] : effectiveDefault(entry.key, ctx);
    }

    function projectAll(stored, ctx) {
      var settings = {};
      for (var p = 0; p < frozenEntries.length; p += 1) {
        settings[frozenEntries[p].key] = projectValue(frozenEntries[p].key, stored, ctx);
      }
      return { settings: settings, readOnly: readOnlyKeys() };
    }

    function describe(key, stored, ctx) {
      var entry = get(key);
      if (!entry) return null;
      var out = {
        key: entry.key,
        value: projectValue(entry.key, stored, ctx),
        type: entry.type,
        writable: entry.cls === 'writable'
      };
      if (entry.type === 'integer') out.range = { min: entry.min, max: entry.max };
      if (entry.type === 'enum') out.values = entry.values.slice();
      return out;
    }

    // Strict parsing (D-04, D-14): exact true/false, digits-only integers
    // inside the bounds (never clamped), exact enum members, trimmed
    // length-bounded strings. Secrets and endpoints are refused before the
    // value is looked at (D-10, D-11).
    function parseValue(key, raw) {
      var entry = get(key);
      if (!entry) {
        return failure(CODES.UNKNOWN_KEY, key, UNKNOWN_KEY_SENTENCE);
      }
      var label = entry.key;
      if (entry.cls !== 'writable') {
        return failure(CODES.PROTECTED_KEY, key, label + ' is read-only over MCP; change it in the FSB Control Panel.');
      }
      if (typeof raw !== 'string') {
        return failure(CODES.REQUEST_INVALID, key, 'The value for ' + label + ' must be a string.');
      }
      if (raw.length > VALUE_MAX_LENGTH) {
        return failure(CODES.VALUE_INVALID, key, 'The value for ' + label + ' is longer than ' + VALUE_MAX_LENGTH + ' characters.');
      }
      if (entry.type === 'boolean') {
        if (raw === 'true') return { ok: true, value: true };
        if (raw === 'false') return { ok: true, value: false };
        return failure(CODES.VALUE_INVALID, key, label + ' must be true or false.');
      }
      if (entry.type === 'integer') {
        if (INTEGER_RE.test(raw)) {
          var number = Number(raw);
          if (number >= entry.min && number <= entry.max) return { ok: true, value: number };
        }
        return failure(CODES.VALUE_INVALID, key,
          label + ' must be a whole number from ' + entry.min + ' to ' + entry.max + '.',
          { range: { min: entry.min, max: entry.max } });
      }
      if (entry.type === 'enum') {
        if (entry.values.indexOf(raw) !== -1) return { ok: true, value: raw };
        return failure(CODES.VALUE_INVALID, key,
          label + ' must be one of: ' + entry.values.join(', ') + '.',
          { values: entry.values });
      }
      var trimmed = raw.trim();
      var maxLength = entry.maxLength || VALUE_MAX_LENGTH;
      if (trimmed.length > maxLength) {
        return failure(CODES.VALUE_INVALID, key, label + ' must be at most ' + maxLength + ' characters.');
      }
      return { ok: true, value: trimmed };
    }

    // The value a provider-group rule compares against: the stored string,
    // else the effective default (a non-string counts as absent, as in
    // background.js fsbReadAuthoritativeProviderConfig).
    function currentText(key, stored) {
      if (isStored(stored, key) && typeof stored[key] === 'string') return stored[key];
      var fallback = effectiveDefault(key);
      return typeof fallback === 'string' ? fallback : '';
    }

    function isShippedAgent(ctx, id) {
      if (typeof ctx.isShippedAgentId !== 'function') return false;
      try {
        return ctx.isShippedAgentId(id) === true;
      } catch (_e) {
        return false;
      }
    }

    // D-15 readiness of an API provider for autopilot: a hosted provider
    // needs its stored API key, custom needs an endpoint, lmstudio needs
    // nothing, and anything else is refused. Returns a failure or null. The
    // sentence names a provider only from the closed hosted list.
    function apiProviderNotReady(provider, stored, key) {
      if (isHostedProvider(provider)) {
        if (storedNonBlank(stored, PROVIDER_API_KEY[provider])) return null;
        return failure(CODES.PROVIDER_NOT_READY, key, 'Store the ' + provider + ' API key in the FSB Control Panel first.');
      }
      if (provider === 'custom') {
        if (storedNonBlank(stored, 'customEndpoint')) return null;
        return failure(CODES.PROVIDER_NOT_READY, key, 'Set a custom endpoint in the FSB Control Panel first.');
      }
      if (provider === 'lmstudio') return null;
      return failure(CODES.PROVIDER_NOT_READY, key, 'Choose a model provider in the FSB Control Panel first.');
    }

    // D-15 provider rules. Returns { failure, omitted } to refuse, { patch }
    // to replace the default one-key patch, or {} to keep it.
    function providerRule(key, value, stored, ctx) {
      if (key === 'modelProvider') {
        if (value === currentText('modelProvider', stored)) return { patch: { modelProvider: value } };
        var providerNotReady = apiProviderNotReady(value, stored, key);
        if (providerNotReady) return { failure: providerNotReady };
        // custom has no start-time model resolver (only lmstudio does), so its
        // empty default would reach the endpoint as model ''. Keep a stored
        // model name instead, as the control panel's Save does; the caller can
        // then set modelName, which custom accepts as any bounded string.
        if (value === 'custom' && storedNonBlank(stored, 'modelName')) return { patch: { modelProvider: value } };
        var defaults = Config.DEFAULT_MODELS;
        var modelName = hasOwn(defaults, value) && typeof defaults[value] === 'string' ? defaults[value] : '';
        return { patch: { modelProvider: value, modelName: modelName } };
      }
      if (key === 'modelName') {
        var provider = currentText('modelProvider', stored);
        if (provider === 'lmstudio' || provider === 'custom') return {};
        if (!isHostedProvider(provider)) {
          return { failure: failure(CODES.PROVIDER_NOT_READY, key, 'Choose a model provider in the FSB Control Panel first.') };
        }
        var known = knownModelIds(provider, ctx.discoveredModelIds);
        if (known.indexOf(value) !== -1) return {};
        var shown = known.slice(0, MODEL_LIST_CAP);
        return {
          failure: failure(CODES.VALUE_INVALID, key,
            key + ' is not a known ' + provider + ' model. Refresh models in the FSB Control Panel if it is new.',
            { values: shown }),
          omitted: known.length - shown.length
        };
      }
      if (key === 'providerKind') {
        if (value === 'api') {
          // Switching to api runs autopilot on the stored modelProvider, so it
          // must be ready, as a modelProvider write requires. Re-stating the
          // current kind needs no check.
          if (currentText('providerKind', stored) === 'api') return {};
          var kindNotReady = apiProviderNotReady(currentText('modelProvider', stored), stored, key);
          return kindNotReady ? { failure: kindNotReady } : {};
        }
        if (value !== 'agent') return {};
        var agentId = currentText('agentProviderId', stored);
        if (agentId === '' || !isShippedAgent(ctx, agentId)) {
          return { failure: failure(CODES.PROVIDER_NOT_READY, key, 'Choose an agent provider in the FSB Control Panel first.') };
        }
        return {};
      }
      if (key === 'agentProviderId') {
        if (value !== '' && !isShippedAgent(ctx, value)) {
          var extra = Array.isArray(ctx.shippedAgentIds)
            ? { values: [''].concat(ctx.shippedAgentIds.filter(isNonEmptyString)) }
            : null;
          return { failure: failure(CODES.VALUE_INVALID, key, key + ' is not a shipped agent provider.', extra) };
        }
        if (value === '' && currentText('providerKind', stored) === 'agent') {
          return { failure: failure(CODES.PROVIDER_NOT_READY, key, 'Set providerKind to api before clearing agentProviderId.') };
        }
        return {};
      }
      return {};
    }

    // Decides one MCP write without storage, clock or network access: unknown
    // keys, then secrets and endpoints (before the value is looked at), then
    // strict parsing, then the D-15 provider rules. Nothing is ever clamped.
    // A value equal to a stored one is a no-op (changed []); an absent key is
    // a real write, so every consumer sees one value (D-13, Pitfall 10).
    // ctx: { isShippedAgentId, shippedAgentIds, discoveredModelIds, agentCapRecommendation }.
    function planWrite(key, raw, stored, ctx) {
      var entry = get(key);
      if (!entry) return failure(CODES.UNKNOWN_KEY, key, UNKNOWN_KEY_SENTENCE);
      if (entry.cls !== 'writable') {
        return failure(CODES.PROTECTED_KEY, key, entry.key + ' is read-only over MCP; change it in the FSB Control Panel.');
      }
      if (raw === undefined) return failure(CODES.REQUEST_INVALID, key, 'A value is required to change ' + entry.key + '.');
      var parsed = parseValue(entry.key, raw);
      if (parsed.ok !== true) return withAllowedClause(parsed, 0);

      var store = (stored !== null && typeof stored === 'object') ? stored : {};
      var context = (ctx !== null && typeof ctx === 'object') ? ctx : {};
      var value = parsed.value;
      var patch = null;
      if (entry.group === 'provider') {
        var ruled = providerRule(entry.key, value, store, context);
        if (ruled.failure) return withAllowedClause(ruled.failure, ruled.omitted || 0);
        if (ruled.patch) patch = ruled.patch;
      }
      if (!patch) {
        patch = {};
        patch[entry.key] = value;
      }
      var previous = projectValue(entry.key, store, context);
      var changed = Object.keys(patch);
      var noOp = changed.every(function (patchKey) {
        return isStored(store, patchKey) && store[patchKey] === patch[patchKey];
      });
      if (noOp) {
        patch = {};
        changed = [];
      }
      var result = { ok: true, key: entry.key, value: value, previous: previous, patch: patch, changed: changed };
      // D-18: a write that also sets another key (a modelProvider change sets
      // modelName) reports that key's new and previous value as well, so the
      // reply and the operator log show what was overwritten. Patches hold
      // writable keys only, so no secret can appear here.
      var coupledKeys = changed.filter(function (patchKey) { return patchKey !== entry.key; });
      if (coupledKeys.length > 0) {
        var coupled = {};
        coupledKeys.forEach(function (patchKey) {
          coupled[patchKey] = { value: patch[patchKey], previous: projectValue(patchKey, store, context) };
        });
        result.coupled = coupled;
      }
      return result;
    }

    var instance = {
      entries: frozenEntries,
      keys: keys,
      get: get,
      isWritable: isWritable,
      readOnlyKeys: readOnlyKeys,
      effectiveDefault: effectiveDefault,
      projectValue: projectValue,
      projectAll: projectAll,
      describe: describe,
      parseValue: parseValue,
      planWrite: planWrite
    };
    var staticNames = Object.keys(STATICS);
    for (var s = 0; s < staticNames.length; s += 1) instance[staticNames[s]] = STATICS[staticNames[s]];
    instance.create = create;
    return Object.freeze(instance);
  }

  // A malformed production entry disables the schema instead of throwing:
  // config.js is an unguarded importScripts in background.js, so a throw here
  // would stop the whole service worker. The settings routes already answer
  // SETTING_UNSUPPORTED when the schema is missing. create() itself stays
  // strict, so tests and fixtures still fail loudly.
  var api = null;
  try {
    api = create(PRODUCTION_ENTRIES);
  } catch (error) {
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error('[FSB] Settings schema disabled:', error && error.message);
    }
  }

  if (api) {
    global.FsbSettingsSchema = api;
    if (typeof module !== 'undefined' && module.exports) module.exports.FsbSettingsSchema = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
