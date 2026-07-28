/**
 * AI-powered memory extraction from completed sessions.
 * Produces exactly ONE Task Memory (consolidated recon report) per session.
 *
 * AI-only extraction -- no local fallback. Failures surface via
 * extension badge (red "!") and console errors so the user knows
 * something went wrong.
 */

class MemoryExtractor {
  constructor() {
    // No cached provider -- fresh instance every call
  }

  /**
   * Extract memories from a completed automation session.
   * Requires a configured AI provider. On failure the extension badge
   * is set to red "!" and the error propagates to the caller.
   * @param {Object} session - The session object from background.js
   * @param {Object} context - Additional context (domain, AI integration ref)
   * @returns {Promise<Object[]>} Array of memory objects ready for storage
   */
  async extract(session, context = {}) {
    if (!session || !session.task) {
      console.warn('[MemoryExtractor] No session or task to extract from');
      return [];
    }

    // Slice actionHistory to only new actions since last extraction.
    // This prevents duplicate memories when follow-up commands trigger
    // extraction on a session whose actionHistory keeps growing.
    const actionStartIndex = session._lastExtractionActionIndex || 0;
    const allActions = session.actionHistory || [];
    const newActions = allActions.slice(actionStartIndex);

    if (actionStartIndex > 0 && newActions.length === 0) {
      console.log('[MemoryExtractor] No new actions since last extraction, skipping');
      return [];
    }

    // Retry configuration for transient errors
    const MAX_RETRIES = 2;
    const RETRY_DELAYS = [1000, 2000];

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const provider = await this._getProvider(context);
        const prompt = this._buildExtractionPrompt(session, context, newActions);
        const requestBody = await provider.buildRequest(prompt, {});
        const response = await provider.sendRequest(requestBody, { attempt: 0 });
        const parsed = provider.parseResponse(response);

        const rawContent = typeof parsed.content === 'string'
          ? parsed.content
          : (parsed.content?.memories || parsed.content?.result || JSON.stringify(parsed.content));

        const memories = this._parseExtractedMemories(rawContent, session, context);
        session._lastExtractionActionIndex = allActions.length;
        return memories;
      } catch (error) {
        lastError = error;

        // Auth errors: surface immediately, no retry
        if (this._isAuthError(error)) {
          console.error('[MemoryExtractor] AI extraction auth error:', error.message);
          session._lastExtractionActionIndex = allActions.length;
          throw error;
        }

        // Transient errors: retry if attempts remain
        if (attempt < MAX_RETRIES && this._isTransientError(error)) {
          console.warn(`[MemoryExtractor] Transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAYS[attempt]}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }

        // Non-retryable or retries exhausted
        break;
      }
    }

    // All attempts failed
    console.error('[MemoryExtractor] AI extraction failed:', lastError?.message);
    session._lastExtractionActionIndex = allActions.length;
    throw lastError;
  }

  /**
   * Build the extraction prompt for the AI
   * @param {Object} session - Session object
   * @param {Object} context - Context object
   * @param {Array} newActions - Actions since last extraction (subset of actionHistory)
   */
  _buildExtractionPrompt(session, context, newActions) {
    const domain = context.domain || this._extractDomain(session);
    const status = session.status || 'unknown';
    const duration = session.startTime ? Date.now() - session.startTime : 0;

    // Use newActions for the summary if available, otherwise fall back to full history
    const actionsToSummarize = newActions && newActions.length > 0
      ? newActions
      : (session.actionHistory || []);
    const actionCount = actionsToSummarize.length;

    // Format ALL actions with full detail (URLs, element roles, results)
    // If total exceeds ~4000 chars, keep first 5 + last 15 with gap marker
    const formatAction = (a, idx) => {
      const tool = a.tool || 'unknown';
      const success = a.result?.success !== false;
      const parts = [];
      if (a.params?.url) parts.push(a.params.url);
      else if (a.params?.selector) parts.push(a.params.selector);
      if (a.params?.query) parts.push(`query="${a.params.query}"`);
      if (a.params?.text) parts.push(`text="${a.params.text.substring(0, 80)}"`);
      if (a.params?.value) parts.push(`value="${String(a.params.value).substring(0, 40)}"`);
      const paramsSummary = parts.join(', ') || '';
      const resultDesc = a.result?.description || a.result?.element?.role || a.result?.message || '';
      return `[${idx}] ${tool}(${paramsSummary}) -> ${success ? 'success' : 'fail'}${resultDesc ? ': ' + resultDesc.substring(0, 100) : ''}`;
    };

    let actionLog;
    const fullLog = actionsToSummarize.map((a, i) => formatAction(a, i));
    const fullLogStr = fullLog.join('\n');
    if (fullLogStr.length > 4000 && actionsToSummarize.length > 20) {
      const head = fullLog.slice(0, 5);
      const tailCount = 15;
      const tail = fullLog.slice(fullLog.length - tailCount);
      const omitted = actionsToSummarize.length - 20;
      actionLog = [...head, `[...${omitted} actions omitted...]`, ...tail].join('\n');
    } else {
      actionLog = fullLogStr;
    }

    // Build enriched section from AI instance data (send EVERYTHING, no truncation)
    let enrichedSection = '';
    if (session._enrichedData) {
      const ed = session._enrichedData;
      if (ed.hardFacts?.workingSelectors) {
        const ws = Object.entries(ed.hardFacts.workingSelectors);
        if (ws.length > 0) {
          enrichedSection += '\nWorking selectors discovered:\n' + ws.map(([k, v]) => `  ${k}: ${v}`).join('\n');
        }
      }
      if (ed.hardFacts?.criticalActions?.length > 0) {
        enrichedSection += '\nCritical actions:\n' + ed.hardFacts.criticalActions.map(a => `  ${a.description} (verified: ${a.verified})`).join('\n');
      }
      if (ed.sessionMemory?.stepsCompleted?.length > 0) {
        enrichedSection += '\nSteps completed:\n' + ed.sessionMemory.stepsCompleted.join('\n');
      }
      if (ed.sessionMemory?.failedApproaches?.length > 0) {
        enrichedSection += '\nFailed approaches:\n' + ed.sessionMemory.failedApproaches.join('\n');
      }
      if (ed.compactedSummary) {
        enrichedSection += '\nCompacted summary:\n' + ed.compactedSummary;
      }
    }

    const systemPrompt = `You are an intelligence analyst for a browser automation tool. Analyze the completed automation session below and produce a consolidated reconnaissance report.

Output ONLY a single valid JSON object (not an array) with this exact shape:
{
  "text": "Brief task description -- outcome (e.g. 'Searched Amazon for wireless mouse -- success')",
  "confidence": 0.0-1.0,
  "tags": ["keyword1", "keyword2"],
  "session": {
    "task": "the task that was attempted",
    "outcome": "success" | "partial" | "failure",
    "domain": "domain.com",
    "duration": seconds_number,
    "iterationCount": number,
    "finalUrl": "last URL visited or null",
    "timeline": [{"action": "clicked/typed/navigated/scrolled", "target": "human-readable element description (e.g. 'Search button', 'Email input', 'Add to Cart')", "url": "page URL where this happened or null", "result": "success/fail + brief detail", "timestamp": null}],
    "failures": ["description of each failure encountered"]
  },
  "learned": {
    "selectors": [{"name": "human description", "selector": "CSS/aria selector", "context": "when to use"}],
    "siteStructure": ["description of page layout or navigation path discovered"],
    "patterns": ["behavioral pattern learned, e.g. 'must click cookie banner before search'"]
  },
  "procedures": [{"name": "reusable sequence name", "steps": ["step1", "step2"], "successRate": 1.0, "targetUrl": "URL this applies to"}]
}

Rules:
- Produce exactly ONE JSON object -- this is a consolidated recon report, not multiple fragments
- "text" must be a natural language summary the user can scan (task + outcome)
- Include ALL working selectors with human-readable descriptions alongside the CSS/aria selector
- For failed sessions, focus on what went wrong in "failures" and "patterns" (what to avoid)
- For successful sessions, capture the winning strategy in "procedures" and "timeline"
- Include full URLs in timeline entries so navigation paths can be reconstructed
- Be specific to the domain -- generic advice is useless
- Do NOT include sensitive data (passwords, personal info, auth tokens)`;

    const userPrompt = `Session reconnaissance data:
Task: ${session.task}
Domain: ${domain}
Status: ${status}
Duration: ${Math.round(duration / 1000)}s
Total actions: ${actionCount}
Stuck count: ${session.stuckCounter || 0}

Complete action log:
${actionLog || 'No actions recorded'}
${enrichedSection}
${session.error ? `\nSession error: ${session.error}` : ''}

Produce the consolidated recon report as a single JSON object:`;

    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
  }

  /**
   * Parse the AI recon report response into a single validated Task Memory.
   * Always returns an array (with 0 or 1 elements) for backward compat with add().
   */
  _parseExtractedMemories(rawContent, session, context) {
    try {
      // Parse JSON from response
      let parsed;
      if (typeof rawContent === 'string') {
        // Strip markdown code blocks if present
        const cleaned = rawContent
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } else if (rawContent && typeof rawContent === 'object') {
        parsed = rawContent;
      } else {
        console.error('[MemoryExtractor] Unexpected rawContent type:', typeof rawContent);
        return [];
      }

      // If AI returned an array (old format), take first element and adapt
      if (Array.isArray(parsed)) {
        console.warn('[MemoryExtractor] AI returned array instead of single object, taking first element');
        parsed = parsed[0];
        if (!parsed) return [];
      }

      // Require at minimum a text field
      if (!parsed.text) {
        console.error('[MemoryExtractor] Parsed recon report missing "text" field');
        return [];
      }

      const domain = context.domain || this._extractDomain(session);
      const sessionId = session.sessionId || null;

      // Infer taskType from session task text
      const taskLower = (session.task || '').toLowerCase();
      let taskType = 'general';
      if (/search|find|look/i.test(taskLower)) taskType = 'search';
      else if (/login|sign.?in|auth/i.test(taskLower)) taskType = 'login';
      else if (/buy|purchase|add.*cart|checkout/i.test(taskLower)) taskType = 'purchase';
      else if (/fill|form|submit|register|sign.?up/i.test(taskLower)) taskType = 'form';
      else if (/navigate|go to|open|visit/i.test(taskLower)) taskType = 'navigation';
      else if (/extract|scrape|get.*data|download/i.test(taskLower)) taskType = 'extraction';

      const metadata = {
        domain,
        taskType,
        tags: parsed.tags || [domain, taskType].filter(Boolean),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        sourceSessionId: sessionId
      };

      const memory = createTaskMemory(parsed.text, metadata, {
        session: parsed.session || {},
        learned: parsed.learned || {},
        procedures: parsed.procedures || []
      });

      const validation = validateMemory(memory);
      if (validation.valid) {
        return [memory];
      }

      console.error('[MemoryExtractor] Task memory validation failed:', validation.errors);
      return [];
    } catch (error) {
      console.error('[MemoryExtractor] Failed to parse AI recon report:', error.message);
      return [];
    }
  }

  /**
   * Load provider settings from chrome.storage.local, validate the API key
   * for the active provider, and return a fresh UniversalProvider instance.
   * Throws on missing config -- caller is responsible for error handling.
   * @param {Object} context - May contain a pre-built .provider
   * @returns {Promise<UniversalProvider>}
   */
  async _getProvider(context) {
    // Reuse provider from context if available
    if (context.provider) return context.provider;

    // Load config directly from chrome.storage.local (matches sitemap-refiner.js pattern)
    const cfg = await new Promise((resolve) => {
      chrome.storage.local.get([
        'modelProvider', 'modelName', 'apiKey',
        'geminiApiKey', 'openaiApiKey', 'anthropicApiKey', 'openrouterApiKey',
        'customApiKey', 'customEndpoint', 'lmstudioBaseUrl'
      ], (result) => {
        const providerName = result.modelProvider || 'xai';
        resolve({
          modelProvider: providerName,
          modelName: typeof result.modelName === 'string'
            ? result.modelName
            : (providerName === 'lmstudio' ? '' : 'grok-4-1-fast-reasoning'),
          apiKey: result.apiKey || '',
          geminiApiKey: result.geminiApiKey || '',
          openaiApiKey: result.openaiApiKey || '',
          anthropicApiKey: result.anthropicApiKey || '',
          openrouterApiKey: result.openrouterApiKey || '',
          customApiKey: result.customApiKey || '',
          customEndpoint: result.customEndpoint || '',
          lmstudioBaseUrl: result.lmstudioBaseUrl || 'http://localhost:1234'
        });
      });
    });

    // Validate API key for selected provider
    const providerName = cfg.modelProvider;
    const keyMap = {
      xai: cfg.apiKey,
      gemini: cfg.geminiApiKey,
      openai: cfg.openaiApiKey,
      anthropic: cfg.anthropicApiKey,
      openrouter: cfg.openrouterApiKey,
      custom: cfg.customApiKey
    };
    const activeKey = keyMap[providerName] || cfg.apiKey || '';

    if (providerName === 'lmstudio') {
      if (!cfg.modelName) {
        throw new Error('[MemoryExtractor] No LM Studio model configured. Select a discovered model in Settings.');
      }
      return new UniversalProvider(cfg);
    }

    if (!activeKey) {
      throw new Error(`[MemoryExtractor] No API key configured for ${providerName}. Memory extraction requires an AI provider.`);
    }

    if (!cfg.modelName) {
      throw new Error('[MemoryExtractor] No model name configured. Memory extraction requires a model selection.');
    }

    return new UniversalProvider(cfg);
  }

  /**
   * Enrich a single already-stored memory with AI analysis.
   * Returns a structured analysis object, or null on any failure.
   * This method never throws -- all errors are caught and logged.
   * Failures set the extension badge to red "!" so the user is aware.
   * @param {Object} memory - A stored memory object
   * @param {Object} context - Optional context (provider, etc.)
   * @returns {Promise<Object|null>} AI analysis object or null
   */
  async enrich(memory, context = {}) {
    try {
      if (!memory || !memory.type || !memory.text) {
        console.warn('[MemoryExtractor] enrich() called with invalid memory');
        return null;
      }

      const provider = await this._getProvider(context);

      const prompt = this._buildEnrichmentPrompt(memory);
      const requestBody = await provider.buildRequest(prompt, {});
      const response = await provider.sendRequest(requestBody, { attempt: 0 });
      const parsed = provider.parseResponse(response);

      const rawContent = typeof parsed.content === 'string'
        ? parsed.content
        : JSON.stringify(parsed.content);

      const analysis = this._parseEnrichmentResponse(rawContent);

      // Track AI usage for cost attribution
      const inputTokens = parsed.usage?.prompt_tokens || parsed.usage?.inputTokens || 0;
      const outputTokens = parsed.usage?.completion_tokens || parsed.usage?.outputTokens || 0;
      const model = parsed.model || 'unknown';
      if (typeof globalAnalytics !== 'undefined' && globalAnalytics) {
        globalAnalytics.trackUsage(model, inputTokens, outputTokens, true, 'memory')
          .catch(err => console.warn('[MemoryExtractor] Analytics tracking failed:', err.message));
      }

      return analysis;
    } catch (error) {
      console.error('[MemoryExtractor] Enrichment failed:', error.message);
      return null;
    }
  }

  /**
   * Build a type-specific enrichment prompt for a memory.
   * Prompts are kept short (~50 tokens system, ~100 tokens user).
   * @param {Object} memory - The memory to analyze
   * @returns {Object} Prompt object with messages array
   */
  _buildEnrichmentPrompt(memory) {
    const typePrompts = {
      semantic: 'Analyze this learned fact. Return JSON with: { category: string, relatedPatterns: string[], reliability: string, usageContext: string }',
      procedural: 'Analyze this action workflow. Return JSON with: { optimizationSuggestions: string[], reliabilityAssessment: string, alternativeApproaches: string[], complexityRating: string }',
      task: 'Analyze this browser automation task report. Return JSON with: { keyTakeaways: string[], riskFactors: string[], optimizationTips: string[], reusabilityAssessment: string, complexityRating: "low"|"medium"|"high", suggestedImprovements: string[] }'
    };

    const systemPrompt = typePrompts[memory.type] || typePrompts.task;

    // Task memories get richer context (1000 char limit) with structured fields
    let typeDataStr;
    if (memory.type === 'task' && memory.typeData) {
      const td = memory.typeData;
      const session = td.session || {};
      const learned = td.learned || {};
      const procs = td.procedures || [];
      const parts = [];
      if (session.task) parts.push(`Task: ${session.task}`);
      if (session.outcome) parts.push(`Outcome: ${session.outcome}`);
      if (session.timeline) parts.push(`Steps: ${session.timeline.length}`);
      if (session.runCount) parts.push(`Run count: ${session.runCount}`);
      if (learned.selectors) parts.push(`Selectors discovered: ${learned.selectors.length}`);
      if (procs.length > 0) parts.push(`Procedures: ${procs.map(p => p.name).join(', ')}`);
      if (learned.patterns?.length > 0) parts.push(`Patterns: ${learned.patterns.join('; ')}`);
      if (session.failures?.length > 0) parts.push(`Failures: ${session.failures.join('; ')}`);
      typeDataStr = parts.join('\n').substring(0, 1000);
    } else {
      typeDataStr = memory.typeData
        ? JSON.stringify(memory.typeData).substring(0, 500)
        : '{}';
    }

    const userPrompt = `Memory: ${memory.text}\nType: ${memory.type}\nDomain: ${memory.metadata?.domain || 'unknown'}\nData: ${typeDataStr}`;

    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
  }

  /**
   * Parse the AI enrichment response into a structured object.
   * Never throws -- returns a fallback object on parse failure.
   * @param {string} rawContent - Raw response content
   * @returns {Object} Parsed analysis object
   */
  _parseEnrichmentResponse(rawContent) {
    try {
      // Strip markdown code blocks if present
      const cleaned = rawContent
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      // Fallback: return raw content as minimal analysis
      return { rawAnalysis: (rawContent || '').substring(0, 500) };
    }
  }

  /**
   * Extract domain from session data
   */
  _extractDomain(session) {
    // Try to get domain from action history URLs
    if (session.actionHistory) {
      for (const action of session.actionHistory) {
        if (action.params?.url) {
          try {
            return new URL(action.params.url).hostname;
          } catch { /* skip */ }
        }
      }
    }
    return null;
  }

  /**
   * Check if an error is an authentication/authorization error.
   * These should surface immediately without retry.
   */
  _isAuthError(error) {
    const msg = (error.message || '').toLowerCase();
    const status = error.status || error.statusCode || 0;
    return status === 401 || status === 403 ||
      msg.includes('unauthorized') || msg.includes('forbidden') ||
      /invalid.*key/i.test(error.message || '');
  }

  /**
   * Check if an error is transient and worth retrying.
   */
  _isTransientError(error) {
    const msg = (error.message || '').toLowerCase();
    const status = error.status || error.statusCode || 0;
    return status === 429 || status === 503 ||
      msg.includes('timeout') || msg.includes('econnreset') ||
      msg.includes('network') || msg.includes('rate limit');
  }

}

// Singleton
const memoryExtractor = new MemoryExtractor();

if (typeof self !== 'undefined') {
  self.MemoryExtractor = MemoryExtractor;
  self.memoryExtractor = memoryExtractor;
}
