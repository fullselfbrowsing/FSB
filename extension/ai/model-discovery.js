/**
 * FSB Model Discovery Module (Phase 228 / Plan 01)
 *
 * Universal entry point: discoverModels(provider, apiKey, opts?) -> Promise<DiscoveryResult>
 *
 * Responsibilities:
 *   - Hit each provider's /models endpoint with the right auth shape
 *   - Parse + filter the response down to text-generation models only
 *   - Normalize entries to a common Model shape
 *   - Cache results per (provider, apiKey-hash) for 24h
 *   - Return STRUCTURED failure objects (never throw to caller)
 *
 * Loads in two environments:
 *   - Chrome MV3 service worker (importScripts) -> attaches to globalThis
 *   - Node test runner (require)               -> exports via module.exports
 *
 * GUARD-01: This module does not touch ai-integration.js / ai-providers.js /
 *           options.js / popup.js / sidepanel.js. Plans 02 + 03 wire it in.
 * GUARD-02: All network IO goes through globalThis.fetch so tests can mock it.
 */

(function defineModelDiscovery(global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // FALLBACK_MODELS
  // Mirror of extension/config/config.js availableModels — kept in sync as the
  // canonical fallback source. We INLINE the data instead of requiring config.js
  // so this file stays loadable inside a Chrome service worker via importScripts
  // (config.js is also SW-loadable, but coupling them would force evaluation
  // order at SW startup time we don't currently guarantee). The Node-side test
  // asserts byte-for-byte parity with config.availableModels.* so any drift
  // surfaces immediately in CI.
  // ---------------------------------------------------------------------------
  const FALLBACK_MODELS = Object.freeze({
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
  });

  // ---------------------------------------------------------------------------
  // Filter regexes (shared)
  // ---------------------------------------------------------------------------
  // Catch-all for non-text-generation modalities. Used by xAI / OpenAI /
  // OpenRouter where ids carry the modality hint inline.
  const NON_TEXT_RX = /(embedding|embed-|whisper|tts-|-audio|-realtime|dall-e|imagen|image-generation|image-1212|-image-)/i;

  function normalizeLmStudioBaseUrl(baseUrl) {
    let url = String(baseUrl || 'http://localhost:1234').trim();
    url = url.replace(/\/v1\/chat\/completions\/?$/i, '');
    url = url.replace(/\/v1\/?$/i, '');
    url = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url || 'http://localhost:1234';
  }

  // ---------------------------------------------------------------------------
  // PROVIDER_DISCOVERY_CONFIG
  // Each entry exposes the four hooks discoverModels() needs.
  // ---------------------------------------------------------------------------
  const PROVIDER_DISCOVERY_CONFIG = {
    // xAI: OpenAI-shaped /v1/models. Bearer auth.
    xai: {
      endpoint: () => 'https://api.x.ai/v1/models',
      headers: (apiKey) => ({ 'Authorization': 'Bearer ' + apiKey }),
      parse: (json) => {
        const arr = (json && Array.isArray(json.data)) ? json.data : [];
        return arr.map(entry => ({
          id: String(entry.id || ''),
          displayName: String(entry.id || ''), // xAI does not expose a display name
          createdAt: typeof entry.created === 'number' ? entry.created * 1000 : undefined,
          raw: entry
        }));
      },
      // Why: xAI lists only grok-* text models in production, but defensively
      // drop anything that doesn't start with "grok-" or matches the shared
      // non-text regex (e.g. grok-2-image-* image-gen variants).
      filter: (m) => /^grok-/i.test(m.id) && !NON_TEXT_RX.test(m.id)
    },

    // OpenAI: Bearer auth. Returns ~50 entries — aggressive allowlist needed.
    openai: {
      endpoint: () => 'https://api.openai.com/v1/models',
      headers: (apiKey) => ({ 'Authorization': 'Bearer ' + apiKey }),
      parse: (json) => {
        const arr = (json && Array.isArray(json.data)) ? json.data : [];
        return arr.map(entry => ({
          id: String(entry.id || ''),
          displayName: String(entry.id || ''),
          createdAt: typeof entry.created === 'number' ? entry.created * 1000 : undefined,
          raw: entry
        }));
      },
      // Why: OpenAI returns embeddings, whisper, tts, dall-e, image, audio, and
      // realtime variants alongside chat models. Allowlist to gpt-/chatgpt-/
      // o1-/o3-/o4-, then exclude any modality-specific suffix.
      filter: (m) => /^(gpt-|chatgpt-|o1-|o3-|o4-)/i.test(m.id) && !NON_TEXT_RX.test(m.id)
    },

    // Anthropic: x-api-key header + anthropic-version header.
    anthropic: {
      endpoint: () => 'https://api.anthropic.com/v1/models',
      headers: (apiKey) => ({
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }),
      parse: (json) => {
        const arr = (json && Array.isArray(json.data)) ? json.data : [];
        return arr.map(entry => {
          const createdAt = entry.created_at ? Date.parse(entry.created_at) : undefined;
          return {
            id: String(entry.id || ''),
            displayName: String(entry.display_name || entry.id || ''),
            createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
            raw: entry
          };
        });
      },
      // Why: Anthropic only ships Claude text models on this endpoint. type
      // field is "model" today; we accept absent type for forward-compat.
      filter: (m) => /^claude-/i.test(m.id) && !(m.raw && m.raw.type && m.raw.type !== 'model'),
      // Why: Anthropic returns models in arbitrary order; UI wants newest-first.
      sort: (models) => models.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    },

    // Gemini: API key in URL query string.
    gemini: {
      endpoint: (apiKey) => 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey),
      headers: () => ({}),
      parse: (json) => {
        const arr = (json && Array.isArray(json.models)) ? json.models : [];
        return arr.map(entry => {
          // "name": "models/gemini-2.5-flash" -> id "gemini-2.5-flash"
          const rawName = String(entry.name || '');
          const id = rawName.startsWith('models/') ? rawName.slice('models/'.length) : rawName;
          return {
            id,
            displayName: String(entry.displayName || id),
            contextWindow: typeof entry.inputTokenLimit === 'number' ? entry.inputTokenLimit : undefined,
            capabilities: Array.isArray(entry.supportedGenerationMethods) ? entry.supportedGenerationMethods.slice() : undefined,
            raw: entry
          };
        });
      },
      // Why: must support generateContent (chat). Drop embedding / aqa / imagen
      // even when they happen to expose generateContent (imagen sometimes does).
      filter: (m) => {
        const methods = (m.raw && Array.isArray(m.raw.supportedGenerationMethods)) ? m.raw.supportedGenerationMethods : [];
        if (!methods.includes('generateContent')) return false;
        if (/embedding|aqa|imagen/i.test(m.id)) return false;
        return true;
      }
    },

    // OpenRouter: Bearer auth (key recommended for personalized list).
    openrouter: {
      endpoint: () => 'https://openrouter.ai/api/v1/models',
      headers: (apiKey) => ({ 'Authorization': 'Bearer ' + apiKey }),
      parse: (json) => {
        const arr = (json && Array.isArray(json.data)) ? json.data : [];
        return arr.map(entry => ({
          id: String(entry.id || ''),
          displayName: String(entry.name || entry.id || ''),
          contextWindow: typeof entry.context_length === 'number' ? entry.context_length : undefined,
          raw: entry
        }));
      },
      // Why: OpenRouter aggregates many providers; require positive context_length
      // to skip embedding / vision-only entries that report 0, and drop any id
      // matching the non-text modality regex.
      filter: (m) => (m.contextWindow || 0) > 0 && !NON_TEXT_RX.test(m.id)
    },

    // LM Studio: local OpenAI-compatible endpoint with no authentication.
    // Its /v1/models response does not expose capability metadata, so filter
    // obvious non-chat modalities by id. Discovery intentionally bypasses the
    // persistent 24h provider cache because the locally loaded model set can
    // change at any time.
    lmstudio: {
      requiresApiKey: false,
      cacheable: false,
      endpoint: (_apiKey, options) => normalizeLmStudioBaseUrl(options && options.baseUrl) + '/v1/models',
      headers: () => ({}),
      parse: (json) => {
        const arr = (json && Array.isArray(json.data)) ? json.data : [];
        const seen = new Set();
        return arr.reduce((models, entry) => {
          const id = String(entry && entry.id || '').trim();
          if (!id || seen.has(id)) return models;
          seen.add(id);
          models.push({ id, displayName: id, raw: entry });
          return models;
        }, []);
      },
      filter: (m) => !!m.id && !NON_TEXT_RX.test(m.id)
    }
  };

  // ---------------------------------------------------------------------------
  // hashApiKey: stable, non-cryptographic FNV-1a 32-bit hash. We only need an
  // opaque cache key — security is not a goal here. (Cache lives in process
  // memory and is never persisted.)
  // ---------------------------------------------------------------------------
  function hashApiKey(apiKey) {
    const s = String(apiKey == null ? '' : apiKey);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      // 32-bit FNV prime mul without BigInt
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'fnv1a_' + h.toString(16);
  }

  // ---------------------------------------------------------------------------
  // Cache. Two-tier: in-memory Map (fast) backed by chrome.storage.local
  // (survives MV3 service-worker restart). Phase 232: previously the in-memory
  // cache evaporated on SW kill, so the options page kept showing an empty
  // dropdown until the user re-clicked Discover. Now we hydrate from storage
  // on first access and persist every successful write.
  //
  // Storage schema (chrome.storage.local):
  //   { fsbDiscoveryCache: { "<provider>:<apiKeyHash>": { result, expiresAt } } }
  //
  // Tests run in plain Node (no chrome global) — storage layer is a no-op then.
  // ---------------------------------------------------------------------------
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const STORAGE_KEY = 'fsbDiscoveryCache';
  const _cache = new Map();
  let _hydratedFromStorage = false;

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  async function _hydrateCacheFromStorage() {
    if (_hydratedFromStorage || !_hasStorage()) {
      _hydratedFromStorage = true;
      return;
    }
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (d) => resolve(d || {}));
      });
      const stored = data && data[STORAGE_KEY];
      if (stored && typeof stored === 'object') {
        const now = Date.now();
        for (const k of Object.keys(stored)) {
          const entry = stored[k];
          if (entry && entry.expiresAt > now && entry.result) {
            _cache.set(k, entry);
          }
        }
      }
    } catch (_) { /* storage unavailable; fall through */ }
    _hydratedFromStorage = true;
  }

  function _persistCacheToStorage() {
    if (!_hasStorage()) return;
    try {
      const obj = {};
      for (const [k, v] of _cache.entries()) {
        if (v && v.expiresAt > Date.now()) obj[k] = v;
      }
      chrome.storage.local.set({ [STORAGE_KEY]: obj }, () => { /* noop */ });
    } catch (_) { /* noop */ }
  }

  function _cacheKey(provider, apiKey) {
    return provider + ':' + hashApiKey(apiKey);
  }

  function clearDiscoveryCache(provider) {
    if (!provider) {
      _cache.clear();
      _persistCacheToStorage();
      return;
    }
    const prefix = provider + ':';
    for (const k of Array.from(_cache.keys())) {
      if (k.startsWith(prefix)) _cache.delete(k);
    }
    _persistCacheToStorage();
  }

  // ---------------------------------------------------------------------------
  // getDiscoveredModelIds: read-only view of the in-memory cache. Returns the
  // ids of the most-recent non-expired ok:true cache entry for the provider.
  // Used by extension/config/config.js validateAndCorrectModel to avoid
  // silently rewriting freshly-discovered ids that aren't in FALLBACK_MODELS.
  // Does NOT trigger network calls. Returns [] when nothing usable cached.
  // ---------------------------------------------------------------------------
  function getDiscoveredModelIds(provider) {
    if (!provider) return [];
    const prefix = provider + ':';
    const now = Date.now();
    let best = null;
    for (const [key, entry] of _cache.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (!entry || entry.expiresAt <= now) continue;
      if (!entry.result || entry.result.ok !== true || !Array.isArray(entry.result.models)) continue;
      // Most-recent non-expired wins. We don't track insertion time explicitly,
      // but Map iteration is insertion-ordered, so the last match is newest.
      best = entry;
    }
    if (!best) return [];
    return best.result.models.map(m => String(m.id || '')).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // discoverModels: the universal entry point.
  //
  // opts.timeoutMs (optional): overrides the 5000ms default. Tests use a small
  //   value to exercise the timeout branch deterministically.
  // ---------------------------------------------------------------------------
  async function discoverModels(provider, apiKey, opts) {
    const options = opts || {};
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 5000;

    const cfg = PROVIDER_DISCOVERY_CONFIG[provider];
    if (!cfg) {
      return {
        ok: false,
        reason: 'unsupported-provider',
        message: 'Unknown provider: ' + provider,
        provider: String(provider)
      };
    }

    if (cfg.requiresApiKey !== false && !apiKey) {
      return {
        ok: false,
        reason: 'missing-api-key',
        message: 'API key required for provider: ' + provider,
        provider
      };
    }

    const cacheable = cfg.cacheable !== false;
    let key = null;
    if (cacheable) {
      // Phase 232: hydrate persistent cache before reading (no-op in tests).
      await _hydrateCacheFromStorage();

      // Cache hit?
      key = _cacheKey(provider, apiKey);
      const cached = _cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return Object.assign({}, cached.result, { source: 'cache' });
      }
    }

    // Build request
    const url = cfg.endpoint(apiKey, options);
    const headers = Object.assign({ 'Accept': 'application/json' }, cfg.headers(apiKey) || {});

    // AbortController for the timeout
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timer = null;
    if (controller) {
      timer = setTimeout(() => {
        try { controller.abort(); } catch (_) { /* noop */ }
      }, timeoutMs);
    }

    let response;
    try {
      response = await globalThis.fetch(url, {
        method: 'GET',
        headers,
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))) {
        return {
          ok: false,
          reason: 'timeout',
          message: 'Discovery request timed out after ' + timeoutMs + 'ms',
          provider
        };
      }
      return {
        ok: false,
        reason: 'network-failed',
        message: 'Network error: ' + (err && err.message ? err.message : String(err)),
        provider
      };
    } finally {
      if (timer) clearTimeout(timer);
    }

    // Auth failure split out so the UI can surface "API key invalid"
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: 'auth-failed',
        status: response.status,
        message: 'Authentication failed (' + response.status + ')',
        provider
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: 'network-failed',
        status: response.status,
        message: 'HTTP ' + response.status,
        provider
      };
    }

    let json;
    try {
      json = await response.json();
    } catch (err) {
      return {
        ok: false,
        reason: 'network-failed',
        message: 'Invalid JSON in response: ' + (err && err.message ? err.message : String(err)),
        provider
      };
    }

    let parsed;
    try {
      parsed = cfg.parse(json) || [];
    } catch (err) {
      return {
        ok: false,
        reason: 'network-failed',
        message: 'Parse error: ' + (err && err.message ? err.message : String(err)),
        provider
      };
    }

    let filtered = parsed.filter((m) => {
      try { return !!cfg.filter(m); } catch (_) { return false; }
    });

    if (typeof cfg.sort === 'function') {
      try { filtered = cfg.sort(filtered); } catch (_) { /* keep unsorted on sort error */ }
    }

    if (!filtered.length) {
      return {
        ok: false,
        reason: 'empty-response',
        message: 'No text-generation models returned by provider after filtering',
        provider
      };
    }

    const result = {
      ok: true,
      models: filtered,
      source: 'live',
      provider
    };

    if (cacheable) {
      _cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      _persistCacheToStorage();
    }

    return result;
  }

  // Phase 232: also expose hydration so the options page can warm the cache
  // BEFORE the first runDiscovery call, ensuring the dropdown reflects the
  // last-known-good list immediately on page open.
  async function hydrateDiscoveryCache() {
    return _hydrateCacheFromStorage();
  }

  // ---------------------------------------------------------------------------
  // Exports — dual: globalThis (SW) + module.exports (Node tests)
  // ---------------------------------------------------------------------------
  const api = {
    discoverModels,
    PROVIDER_DISCOVERY_CONFIG,
    FALLBACK_MODELS,
    clearDiscoveryCache,
    getDiscoveredModelIds,
    hashApiKey,
    hydrateDiscoveryCache,
    normalizeLmStudioBaseUrl
  };

  if (global) {
    global.discoverModels = discoverModels;
    global.PROVIDER_DISCOVERY_CONFIG = PROVIDER_DISCOVERY_CONFIG;
    global.FALLBACK_MODELS = FALLBACK_MODELS;
    global.clearDiscoveryCache = clearDiscoveryCache;
    global.getDiscoveredModelIds = getDiscoveredModelIds;
    global.hashApiKeyForDiscovery = hashApiKey;
    global.hydrateDiscoveryCache = hydrateDiscoveryCache;
    global.FSBModelDiscovery = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
