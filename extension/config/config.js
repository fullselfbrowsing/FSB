/**
 * Configuration management for FSB v0.9.91
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
    const defaultModels = {
      'xai': 'grok-4-1-fast',
      'gemini': 'gemini-2.5-flash',
      'openai': 'gpt-4o',
      'anthropic': 'claude-sonnet-4-6',
      'openrouter': 'openai/gpt-4o',
      'lmstudio': '',
      'custom': ''
    };

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
