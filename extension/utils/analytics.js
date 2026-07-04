// FSB Analytics - Usage Tracking and Cost Calculation
// Manages token counting, cost calculation, and usage analytics

function normalizeUsageSource(source) {
  const value = typeof source === 'string' ? source.trim().toLowerCase() : '';
  // Phase 271 (v0.9.69) reconciliation #1: extend the legal-source enum to
  // include `'mcp'` (MCPMetricsRecorder rows) and `'ai-provider'` (back-filled
  // existing rows from extension/ai/cost-tracker.js). Without this, every
  // loadStoredData cycle would clobber `'mcp'` to `'automation'`. The legacy
  // three workflow values continue to pass through untouched.
  if (
    value === 'memory' ||
    value === 'sitemap' ||
    value === 'mcp' ||
    value === 'ai-provider'
  ) {
    return value;
  }
  return 'automation';
}

class FSBAnalytics {
  constructor() {
    // Model pricing per 1M tokens (USD) - Updated January 2025
    this.pricing = {
      // xAI Models - Current valid models
      'grok-4-0709': { input: 3.00, output: 15.00 },
      'grok-4-1-fast-reasoning': { input: 0.20, output: 0.50 },
      'grok-4-1-fast-non-reasoning': { input: 0.20, output: 0.50 },
      'grok-4-fast-reasoning': { input: 3.00, output: 15.00 },
      'grok-4-fast-non-reasoning': { input: 3.00, output: 15.00 },
      'grok-code-fast-1': { input: 0.20, output: 1.50 },
      'grok-3': { input: 5.00, output: 25.00 },
      'grok-3-mini': { input: 0.30, output: 0.50 },
      // xAI Legacy (for historical data)
      'grok-4-1-fast': { input: 0.20, output: 0.50 },
      'grok-4': { input: 3.00, output: 15.00 },
      'grok-4-fast': { input: 3.00, output: 15.00 },
      'grok-4-1': { input: 3.00, output: 15.00 },
      'grok-3-fast': { input: 0.50, output: 2.50 },
      'grok-3-mini-beta': { input: 0.30, output: 1.50 },
      'grok-3-mini-fast-beta': { input: 0.10, output: 0.50 },

      // Anthropic Models - Current
      'claude-opus-4-6': { input: 15.00, output: 75.00 },
      'claude-opus-4-5-20251101': { input: 15.00, output: 75.00 },
      'claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
      'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
      'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
      'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
      'claude-haiku-3-5-20241022': { input: 0.80, output: 4.00 },
      // Anthropic Legacy (for historical data)
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
      'claude-haiku-4-5': { input: 1.00, output: 5.00 },
      'claude-opus-4-1': { input: 15.00, output: 75.00 },
      'claude-sonnet-4': { input: 3.00, output: 15.00 },
      'claude-opus-4': { input: 15.00, output: 75.00 },
      'claude-sonnet-3.7': { input: 3.00, output: 15.00 },
      'claude-3-7-sonnet-20250219': { input: 3.00, output: 15.00 },

      // OpenAI Models - Current
      'gpt-5.4': { input: 10.00, output: 40.00 },
      'gpt-5.4-pro': { input: 30.00, output: 120.00 },
      'gpt-5.2': { input: 10.00, output: 40.00 },
      'gpt-5.2-pro': { input: 30.00, output: 120.00 },
      'gpt-5.1': { input: 10.00, output: 40.00 },
      'gpt-5': { input: 10.00, output: 40.00 },
      'gpt-5-pro': { input: 30.00, output: 120.00 },
      'o3': { input: 10.00, output: 40.00 },
      'o3-pro': { input: 30.00, output: 120.00 },
      'o1': { input: 15.00, output: 60.00 },
      'o1-pro': { input: 30.00, output: 120.00 },
      'gpt-4.1': { input: 2.00, output: 8.00 },
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-5-mini': { input: 1.10, output: 4.40 },
      'gpt-5-nano': { input: 0.10, output: 0.40 },
      'gpt-4.1-mini': { input: 0.40, output: 1.60 },
      'gpt-4.1-nano': { input: 0.10, output: 0.40 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'o3-mini': { input: 1.10, output: 4.40 },
      'o4-mini': { input: 1.10, output: 4.40 },
      'o1-mini': { input: 3.00, output: 12.00 },
      // OpenAI Legacy (for historical data)
      'gpt-4o-2024-08-06': { input: 2.50, output: 10.00 },
      'gpt-4o-2024-05-13': { input: 5.00, output: 20.00 },
      'chatgpt-4o-latest': { input: 2.50, output: 10.00 },
      'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-4-turbo-2024-04-09': { input: 10.00, output: 30.00 },

      // Google Gemini Models - Current
      'gemini-3.1-pro-preview': { input: 1.25, output: 10.00 },
      'gemini-2.5-pro': { input: 1.25, output: 10.00 },
      'gemini-2.5-pro-preview-06-05': { input: 1.25, output: 10.00 },
      'gemini-3-flash-preview': { input: 0.30, output: 2.50 },
      'gemini-2.5-flash': { input: 0.30, output: 2.50 },
      'gemini-2.5-flash-preview-05-20': { input: 0.30, output: 2.50 },
      'gemini-3.1-flash-lite-preview': { input: 0.10, output: 0.40 },
      'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
      'gemini-2.0-flash': { input: 0.10, output: 0.40 },
      // Gemini Legacy (for historical data)
      'gemini-2.5-flash-001': { input: 0.30, output: 2.50 },
      'gemini-2.0-flash-exp': { input: 0.00, output: 0.00 },
      'gemini-2.0-flash-001': { input: 0.00, output: 0.00 },
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },

      // Legacy models (for backward compatibility)
      'openai-o3': { input: 10.00, output: 40.00 },
      'claude-4-opus': { input: 15.00, output: 75.00 },
      'claude-4-sonnet': { input: 3.00, output: 15.00 },
      'llama-3.1-405b': { input: 0.80, output: 0.80 },
      'deepseek-v3': { input: 0.27, output: 1.10 }
    };

    // Usage data storage
    this.usageData = [];
    this.sessionStartTime = Date.now();
    this.currentModel = 'grok-4-1-fast-reasoning';
    
    // Chart instance
    this.chart = null;
    
    // Initialization promise for async operations
    this.initialized = false;
    this.initPromise = this.initialize();
  }
  
  // Async initialization method
  async initialize() {
    try {
      console.log('FSB Analytics initializing...');
      
      // Load existing data
      await this.loadStoredData();
      
      // Start session timer
      this.startSessionTimer();
      
      this.initialized = true;
      console.log('FSB Analytics initialized successfully');
    } catch (error) {
      console.error('Failed to initialize FSB Analytics:', error);
    }
  }
  
  // Ensure initialization before operations
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }

  // Load stored usage data from chrome storage
  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get(['fsbUsageData', 'fsbCurrentModel']);
      console.log('Analytics: Loading stored data:', {
        hasUsageData: !!result.fsbUsageData,
        dataLength: result.fsbUsageData ? result.fsbUsageData.length : 0,
        currentModel: result.fsbCurrentModel
      });
      
      if (result.fsbUsageData) {
        // Phase 271 (v0.9.69) decision 7 + reconciliation #1: one-time
        // idempotent back-fill of `source: 'ai-provider'` on rows that lack
        // a source-surface marker AND carry the AI-provider shape
        // (model + inputTokens). Genuinely-legacy workflow-source rows
        // (which already carry one of automation|memory|sitemap) retain
        // their value. After the walk, if ANY row was back-filled, persist
        // once via saveData() so subsequent reads do NOT re-run the
        // heuristic. The persistence makes the migration idempotent across
        // reloads -- a second loadStoredData walk finds source='ai-provider'
        // already present and the back-fill is a no-op.
        let backfilled = false;
        this.usageData = result.fsbUsageData.map((entry) => {
          const next = { ...entry };
          const hasSourceString = typeof next.source === 'string' && next.source.length > 0;
          if (
            !hasSourceString &&
            typeof next.model === 'string' &&
            typeof next.inputTokens === 'number'
          ) {
            next.source = 'ai-provider';
            backfilled = true;
          } else {
            next.source = normalizeUsageSource(next.source);
          }
          return next;
        });
        console.log(`Analytics: Loaded ${this.usageData.length} usage entries`);
        // Clean old data (keep only last 30 days)
        this.cleanOldData();
        console.log(`Analytics: After cleanup, ${this.usageData.length} entries remain`);
        if (backfilled) {
          // Single persist pass after the migration. saveData writes the
          // entire fsbUsageData array back, so the next load sees the
          // back-filled rows and the walk above becomes a pure no-op.
          await this.saveData();
        }
      } else {
        console.log('Analytics: No stored usage data found, starting fresh');
      }
      
      if (result.fsbCurrentModel) {
        this.currentModel = result.fsbCurrentModel;
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    }
  }

  // Save usage data to chrome storage
  async saveData() {
    try {
      await chrome.storage.local.set({
        fsbUsageData: this.usageData,
        fsbCurrentModel: this.currentModel
      });
    } catch (error) {
      console.error('Failed to save analytics data:', error);
    }
  }

  // Clean data older than 30 days
  cleanOldData() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    this.usageData = this.usageData.filter(entry => entry.timestamp > thirtyDaysAgo);
  }

  // Track AI request usage
  async trackUsage(model, inputTokens, outputTokens, success = true, source = 'automation', provider = '') {
    try {
      // Ensure initialization is complete
      await this.ensureInitialized();

      const entry = {
        timestamp: Date.now(),
        model: model,
        provider: provider,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        success: success,
        source: normalizeUsageSource(source),
        cost: this.calculateCost(model, inputTokens, outputTokens, provider)
      };

      this.usageData.push(entry);
      this.currentModel = model;
      
      console.log('Usage tracked:', entry);
      
      // Save to storage (async)
      await this.saveData();
      
      // Update dashboard
      this.updateDashboard();
      
    } catch (error) {
      console.error('Failed to track usage:', error);
    }
  }

  // Calculate cost for a request
  calculateCost(model, inputTokens, outputTokens, provider = '') {
    if ((provider || '').toLowerCase() === 'lmstudio') {
      return 0;
    }

    const modelKey = this.normalizeModelName(model);
    const pricing = this.pricing[modelKey];
    
    if (!pricing) {
      console.warn(`No pricing data for model: ${model}`);
      return 0;
    }

    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
  }

  // Normalize model names to match pricing keys
  normalizeModelName(model) {
    // Handle model name aliases and variations
    const normalizations = {
      // xAI Models - Current valid models
      'grok-4-0709': 'grok-4-0709',
      'grok-4-1-fast-reasoning': 'grok-4-1-fast-reasoning',
      'grok-4-1-fast-non-reasoning': 'grok-4-1-fast-non-reasoning',
      'grok-4-fast-reasoning': 'grok-4-fast-reasoning',
      'grok-4-fast-non-reasoning': 'grok-4-fast-non-reasoning',
      'grok-code-fast-1': 'grok-code-fast-1',
      'grok-3': 'grok-3',
      'grok-3-mini': 'grok-3-mini',
      // xAI Legacy redirects
      'grok-4-1-fast': 'grok-4-1-fast-reasoning',
      'grok-4': 'grok-4-0709',
      'grok-4-fast': 'grok-4-fast-reasoning',
      'grok-4-1': 'grok-4-0709',
      'grok-3-fast': 'grok-3',
      'grok-3-mini-beta': 'grok-3-mini',
      'grok-3-mini-fast-beta': 'grok-3-mini',
      'grok-3-mini-fast': 'grok-3-mini',

      // Anthropic Models - Current
      'claude-opus-4-6': 'claude-opus-4-6',
      'claude-opus-4-5-20251101': 'claude-opus-4-5-20251101',
      'claude-opus-4-1-20250805': 'claude-opus-4-1-20250805',
      'claude-opus-4-20250514': 'claude-opus-4-20250514',
      'claude-sonnet-4-6': 'claude-sonnet-4-6',
      'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
      'claude-haiku-3-5-20241022': 'claude-haiku-3-5-20241022',
      // Anthropic Legacy redirects
      'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
      'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
      'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
      'claude-opus-4-1': 'claude-opus-4-1-20250805',
      'claude-opus-4.1': 'claude-opus-4-1-20250805',
      'claude-sonnet-4': 'claude-sonnet-4-20250514',
      'claude-opus-4': 'claude-opus-4-20250514',

      // OpenAI Models
      'gpt-5.4': 'gpt-5.4',
      'gpt-5.4-pro': 'gpt-5.4-pro',
      'gpt-5.2': 'gpt-5.2',
      'gpt-5.2-pro': 'gpt-5.2-pro',
      'gpt-5.1': 'gpt-5.1',
      'gpt-5': 'gpt-5',
      'gpt-5-pro': 'gpt-5-pro',
      'o3': 'o3',
      'o3-pro': 'o3-pro',
      'o1': 'o1',
      'o1-pro': 'o1-pro',
      'gpt-4.1': 'gpt-4.1',
      'gpt-4o': 'gpt-4o',
      'gpt-5-mini': 'gpt-5-mini',
      'gpt-5-nano': 'gpt-5-nano',
      'gpt-4.1-mini': 'gpt-4.1-mini',
      'gpt-4.1-nano': 'gpt-4.1-nano',
      'gpt-4o-mini': 'gpt-4o-mini',
      'o3-mini': 'o3-mini',
      'o4-mini': 'o4-mini',
      'o1-mini': 'o1-mini',
      // OpenAI Legacy redirects
      'chatgpt-4o-latest': 'gpt-4o',
      'gpt-4-turbo': 'gpt-4.1',
      'gpt-3.5-turbo': 'gpt-4o-mini',

      // Gemini Models
      'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-pro-preview-06-05': 'gemini-2.5-pro-preview-06-05',
      'gemini-3-flash-preview': 'gemini-3-flash-preview',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash-preview-05-20',
      'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
      'gemini-2.0-flash': 'gemini-2.0-flash',
      // Gemini Legacy
      'gemini-2.0-flash-exp': 'gemini-2.0-flash',
      'gemini-1.5-flash': 'gemini-2.0-flash',

      // Cross-provider legacy
      'claude-3-5-sonnet-20241022': 'claude-sonnet-4-5-20250929',
      'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
      'claude-3-opus-20240229': 'claude-opus-4-20250514'
    };

    return normalizations[model] || model;
  }

  // PERF: Single-pass aggregation for all-time stats (replaces 5 separate array passes)
  getAllTimeStats() {
    let successfulRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    for (const entry of this.usageData) {
      if (entry.success) successfulRequests++;
      totalInputTokens += entry.inputTokens || 0;
      totalOutputTokens += entry.outputTokens || 0;
      totalCost += entry.cost || 0;
    }

    const totalRequests = this.usageData.length;
    const stats = {
      totalRequests,
      successfulRequests,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      totalTokens: totalInputTokens + totalOutputTokens
    };

    return stats;
  }

  // Get usage statistics for a time period
  getStats(timeRange = '24h') {
    const now = Date.now();
    let startTime;

    switch (timeRange) {
      case '24h':
        startTime = now - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = now - (24 * 60 * 60 * 1000);
    }

    // PERF: Single-pass aggregation with inline time filtering
    let totalRequests = 0;
    let successfulRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    for (const entry of this.usageData) {
      if (entry.timestamp >= startTime) {
        totalRequests++;
        if (entry.success) successfulRequests++;
        totalInputTokens += entry.inputTokens || 0;
        totalOutputTokens += entry.outputTokens || 0;
        totalCost += entry.cost || 0;
      }
    }

    const stats = {
      totalRequests,
      successfulRequests,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      totalTokens: totalInputTokens + totalOutputTokens
    };

    return stats;
  }

  // Get usage statistics filtered by source ('automation', 'memory', 'sitemap')
  // Entries without a source field are treated as 'automation' for backward compatibility.
  getStatsBySource(timeRange = '24h', source = 'automation') {
    const now = Date.now();
    let startTime;

    switch (timeRange) {
      case '24h':
        startTime = now - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = now - (24 * 60 * 60 * 1000);
    }

    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const entry of this.usageData) {
      if (entry.timestamp >= startTime) {
        const entrySource = entry.source || 'automation';
        if (entrySource === source) {
          totalRequests++;
          totalTokens += (entry.inputTokens || 0) + (entry.outputTokens || 0);
          totalCost += entry.cost || 0;
        }
      }
    }

    return { totalCost, totalRequests, totalTokens };
  }

  // Get chart data for different time ranges
  getChartData(timeRange = '24h') {
    console.log(`Analytics: Getting chart data for time range: ${timeRange}`);
    const stats = this.getStats(timeRange);
    console.log('Analytics: Stats for chart:', stats);
    
    const now = Date.now();
    let startTime, interval, labels = [];

    switch (timeRange) {
      case '24h':
        startTime = now - (24 * 60 * 60 * 1000);
        interval = 60 * 60 * 1000; // 1 hour intervals
        for (let i = 24; i >= 0; i--) {
          const time = new Date(now - (i * interval));
          labels.push(time.getHours() + ':00');
        }
        break;
      case '7d':
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        interval = 24 * 60 * 60 * 1000; // 1 day intervals
        for (let i = 7; i >= 0; i--) {
          const time = new Date(now - (i * interval));
          labels.push(time.toLocaleDateString(undefined, { weekday: 'short' }));
        }
        break;
      case '30d':
        startTime = now - (30 * 24 * 60 * 60 * 1000);
        interval = 24 * 60 * 60 * 1000; // 1 day intervals
        for (let i = 30; i >= 0; i--) {
          const time = new Date(now - (i * interval));
          labels.push(time.getDate());
        }
        break;
    }

    // Aggregate data by time intervals
    const inputData = new Array(labels.length).fill(0);
    const outputData = new Array(labels.length).fill(0);

    this.usageData.forEach(entry => {
      if (entry.timestamp >= startTime) {
        const intervalIndex = Math.floor((now - entry.timestamp) / interval);
        const dataIndex = labels.length - 1 - intervalIndex;
        
        if (dataIndex >= 0 && dataIndex < labels.length) {
          inputData[dataIndex] += entry.inputTokens;
          outputData[dataIndex] += entry.outputTokens;
        }
      }
    });

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Input Tokens',
          data: inputData,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Output Tokens',
          data: outputData,
          borderColor: '#404040',
          backgroundColor: 'rgba(64, 64, 64, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };
    
    console.log('Analytics: Final chart data structure:', {
      labelsCount: chartData.labels.length,
      inputDataSum: inputData.reduce((a, b) => a + b, 0),
      outputDataSum: outputData.reduce((a, b) => a + b, 0),
      sampleLabels: chartData.labels.slice(0, 5)
    });
    
    return chartData;
  }

  // Initialize the usage chart
  initializeChart() {
    console.log('Analytics: Initializing chart...');
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Analytics: Chart.js is not loaded! Retrying in 1 second...');
      setTimeout(() => this.initializeChart(), 1000);
      return;
    }
    
    const ctx = document.getElementById('usageChart');
    if (!ctx) {
      console.error('Analytics: Canvas element #usageChart not found!');
      return;
    }
    
    console.log('Analytics: Canvas element found, creating chart...');

    const chartData = this.getChartData('24h');
    console.log('Analytics: Chart data prepared:', chartData);

    const colors = this.getChartThemeColors();

    try {
      this.chart = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y.toLocaleString() + ' tokens';
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
            },
            grid: { color: colors.grid },
            ticks: { color: colors.tick }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Tokens'
            },
            beginAtZero: true,
            grid: { color: colors.grid },
            ticks: { color: colors.tick }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });

      console.log('Analytics: Chart initialized successfully!');
    } catch (error) {
      console.error('Analytics: Failed to create chart:', error);
      console.error('Analytics: Error details:', error.stack);
    }
  }

  // Grid/tick colors that match the current [data-theme] attribute.
  getChartThemeColors() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(41,29,20,0.08)',
      tick: dark ? '#a99283' : '#8d7a6e'
    };
  }

  // Repaints the chart's grid/tick colors for the current theme in place
  // (mutate + update(), cheaper than destroying/recreating the chart).
  updateChartTheme() {
    if (!this.chart) return;
    const colors = this.getChartThemeColors();
    const scales = this.chart.options.scales;
    if (scales.x) { scales.x.grid.color = colors.grid; scales.x.ticks.color = colors.tick; }
    if (scales.y) { scales.y.grid.color = colors.grid; scales.y.ticks.color = colors.tick; }
    this.chart.update();
  }

  // Update chart with new time range
  updateChart(timeRange) {
    console.log(`Analytics: Updating chart with time range: ${timeRange}`);
    
    if (!this.chart) {
      console.warn('Analytics: Chart not initialized, cannot update');
      return;
    }

    const chartData = this.getChartData(timeRange);
    console.log('Analytics: Updated chart data:', chartData);
    
    this.chart.data = chartData;
    this.chart.update();
    console.log('Analytics: Chart updated successfully');
  }

  // Update dashboard metrics with time range
  updateDashboardWithTimeRange(timeRange = '24h') {
    console.log(`Analytics: updateDashboardWithTimeRange called with range: ${timeRange}`);
    
    const stats = this.getStats(timeRange);
    console.log(`Analytics: Stats for ${timeRange}:`, stats);
    
    // Update hero metrics
    this.updateElement('totalTokensToday', stats.totalTokens.toLocaleString());
    this.updateElement('totalCostToday', '$' + stats.totalCost.toFixed(4));
    this.updateElement('totalRequests', stats.totalRequests.toLocaleString());
    this.updateElement('successRate', stats.successRate.toFixed(1) + '%');
    
    // Update labels based on time range
    this.updateTimeRangeLabels(timeRange);
    
    // Update session time
    this.updateSessionTime();
  }

  // Update dashboard metrics (all-time by default)
  updateDashboard() {
    console.log('Analytics: updateDashboard called');
    console.log('Analytics: Current usage data:', {
      totalEntries: this.usageData.length,
      firstEntry: this.usageData[0],
      lastEntry: this.usageData[this.usageData.length - 1]
    });
    
    const allTimeStats = this.getAllTimeStats();
    console.log('Analytics: All-time stats:', allTimeStats);
    
    // Update hero metrics with all-time data
    this.updateElement('totalTokensToday', allTimeStats.totalTokens.toLocaleString());
    this.updateElement('totalCostToday', '$' + allTimeStats.totalCost.toFixed(4));
    this.updateElement('totalRequests', allTimeStats.totalRequests.toLocaleString());
    this.updateElement('successRate', allTimeStats.successRate.toFixed(1) + '%');
    
    // Update session time
    this.updateSessionTime();
  }

  // Update individual dashboard element
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  // Format model name for display
  formatModelName(model) {
    const displayNames = {
      'grok-4-0709': 'Grok 4',
      'grok-4-1-fast-reasoning': 'Grok 4.1 Fast',
      'grok-4-1-fast-non-reasoning': 'Grok 4.1 Fast (Non-Reasoning)',
      'grok-4-fast-reasoning': 'Grok 4 Fast',
      'grok-4-fast-non-reasoning': 'Grok 4 Fast (Non-Reasoning)',
      'grok-code-fast-1': 'Grok Code Fast',
      'grok-3': 'Grok 3',
      'grok-3-mini': 'Grok 3 Mini',
      // Legacy display names (for historical data)
      'grok-4-1-fast': 'Grok 4.1 Fast',
      'grok-4': 'Grok 4',
      'grok-4-fast': 'Grok 4 Fast',
      'grok-3-fast': 'Grok 3 Fast',
      'grok-3-mini-beta': 'Grok 3 Mini',
      'grok-3-mini-fast-beta': 'Grok 3 Mini Fast'
    };

    return displayNames[model] || model;
  }

  // Start session timer
  startSessionTimer() {
    setInterval(() => {
      this.updateSessionTime();
    }, 60000); // Update every minute
  }

  // Update time range labels
  updateTimeRangeLabels(timeRange) {
    const labelMappings = {
      '24h': { tokens: 'Tokens Today', cost: 'Cost Today', period: 'Today' },
      '7d': { tokens: 'Tokens (7 Days)', cost: 'Cost (7 Days)', period: 'Last 7 Days' },
      '30d': { tokens: 'Tokens (30 Days)', cost: 'Cost (30 Days)', period: 'Last 30 Days' }
    };
    
    const labels = labelMappings[timeRange] || labelMappings['24h'];
    
    // Update label elements if they exist
    const tokensLabel = document.querySelector('#totalTokensToday')?.nextElementSibling;
    const costLabel = document.querySelector('#totalCostToday')?.nextElementSibling;
    const inputLabel = document.querySelector('#inputTokensToday')?.parentElement?.querySelector('.card-subtitle');
    const outputLabel = document.querySelector('#outputTokensToday')?.parentElement?.querySelector('.card-subtitle');
    
    if (tokensLabel) tokensLabel.textContent = labels.tokens;
    if (costLabel) costLabel.textContent = labels.cost;
    if (inputLabel) inputLabel.textContent = labels.period;
    if (outputLabel) outputLabel.textContent = labels.period;
  }

  // Update session time display
  updateSessionTime() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const minutes = Math.floor(sessionDuration / 60000);
    const hours = Math.floor(minutes / 60);
    
    let timeString;
    if (hours > 0) {
      timeString = `${hours}h ${minutes % 60}m`;
    } else {
      timeString = `${minutes}m`;
    }
    
    this.updateElement('sessionTime', timeString);
  }

  // Get model pricing info
  getModelPricing(model) {
    const normalizedModel = this.normalizeModelName(model);
    return this.pricing[normalizedModel] || { input: 0, output: 0 };
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FSBAnalytics;
}
