/**
 * Memory type definitions and validation for FSB Memory Layer
 * Inspired by Mem0's memory architecture, adapted for Chrome extensions.
 *
 * Three memory types:
 *   - Semantic: Learned facts (site patterns, selector insights, user preferences)
 *   - Procedural: Successful action sequences (reusable templates)
 *   - Task: Consolidated reconnaissance report combining session data,
 *           semantic learned facts, and procedural patterns into a single document
 *           per task execution. The preferred format for all new memories.
 */

const MEMORY_TYPES = {
  SEMANTIC: 'semantic',
  PROCEDURAL: 'procedural',
  TASK: 'task'
};

const MEMORY_STORAGE_KEY = 'fsb_memories';
const MEMORY_INDEX_KEY = 'fsb_memory_index';
const MEMORY_META_KEY = 'fsb_memory_meta';

const MAX_MEMORIES = 500;
const MAX_STORAGE_BYTES = 8 * 1024 * 1024; // 8MB of 10MB limit

/**
 * Base schema every memory shares
 */
function createBaseMemory(type, text, metadata = {}) {
  const now = Date.now();
  return {
    id: `mem_${now}_${Math.random().toString(36).substring(2, 8)}`,
    type,
    text,
    metadata: {
      domain: metadata.domain || null,
      taskType: metadata.taskType || null,
      tags: metadata.tags || [],
      confidence: metadata.confidence ?? 1.0,
      aiEnriched: false,
      enrichedAt: null,
      ...metadata
    },
    aiAnalysis: null,
    score: 1.0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    sourceSessionId: metadata.sourceSessionId || null,
    relatedMemories: [],
    typeData: {}
  };
}

/**
 * Create a semantic memory (learned fact)
 * category: 'selector', 'site_pattern', 'user_preference', 'general', 'site_map'
 */
function createSemanticMemory(text, metadata = {}, typeData = {}) {
  const memory = createBaseMemory(MEMORY_TYPES.SEMANTIC, text, metadata);
  memory.typeData = {
    category: typeData.category || 'general',
    selectorInfo: typeData.selectorInfo || null,
    sitePattern: typeData.sitePattern || null,
    validatedAt: typeData.validatedAt || null,
    contradicts: typeData.contradicts || null
  };
  return memory;
}

/**
 * Stored text for a site map memory. Kept in English regardless of the UI
 * language because memory search and AI prompts read it.
 */
function siteMapMemoryText(domain, sitePattern, aiEnhanced = false) {
  const text = `Site map for ${domain}: ${sitePattern.pageCount || 0} pages, ${sitePattern.formCount || 0} forms`;
  return aiEnhanced ? text + ' (AI enhanced)' : text;
}

/**
 * Create a site map memory from domain and sitePattern data
 */
function createSiteMapMemory(domain, sitePattern, metadata = {}) {
  const text = siteMapMemoryText(domain, sitePattern);
  return createSemanticMemory(text, {
    domain,
    tags: ['site_map'],
    confidence: sitePattern.refined ? 0.95 : 0.8,
    ...metadata
  }, {
    category: 'site_map',
    sitePattern
  });
}

/**
 * Create a procedural memory (action sequence template)
 */
function createProceduralMemory(text, metadata = {}, typeData = {}) {
  const memory = createBaseMemory(MEMORY_TYPES.PROCEDURAL, text, metadata);
  memory.typeData = {
    steps: typeData.steps || [],
    selectors: typeData.selectors || [],
    timings: typeData.timings || [],
    successRate: typeData.successRate ?? 1.0,
    totalRuns: typeData.totalRuns || 1,
    lastSuccessAt: typeData.lastSuccessAt || Date.now(),
    targetUrl: typeData.targetUrl || null
  };
  return memory;
}

/**
 * Create a task memory (consolidated reconnaissance report)
 *
 * Combines episodic session data, semantic learned facts, and procedural
 * patterns into a single document per task execution.
 *
 * The `text` field should contain a task + outcome summary, e.g.:
 * "Searched Amazon for wireless mouse -- success"
 *
 * @param {string} text - Task summary with outcome (caller's responsibility)
 * @param {Object} metadata - Standard metadata (domain, tags, etc.)
 * @param {Object} typeData - Nested sections: session, learned, procedures
 * @returns {Object} Complete task memory object
 */
function createTaskMemory(text, metadata = {}, typeData = {}) {
  const memory = createBaseMemory(MEMORY_TYPES.TASK, text, metadata);
  memory.typeData = {
    // Session section (episodic data)
    session: {
      task: typeData.session?.task || typeData.task || '',
      outcome: typeData.session?.outcome || typeData.outcome || 'unknown',
      domain: typeData.session?.domain || metadata.domain || null,
      duration: typeData.session?.duration || typeData.duration || 0,
      iterationCount: typeData.session?.iterationCount || typeData.iterationCount || 0,
      finalUrl: typeData.session?.finalUrl || typeData.finalUrl || null,
      timeline: (typeData.session?.timeline || typeData.timeline || []).map(step => ({
        action: step.action || '',
        target: step.target || '',
        url: step.url || null,
        result: step.result || '',
        timestamp: step.timestamp || null
      })),
      failures: typeData.session?.failures || typeData.failures || []
    },
    // Learned section (semantic data)
    learned: {
      selectors: typeData.learned?.selectors || [],
      siteStructure: typeData.learned?.siteStructure || [],
      patterns: typeData.learned?.patterns || []
    },
    // Procedures section (reusable action sequences)
    procedures: (typeData.procedures || []).map(proc => ({
      name: proc.name || '',
      steps: proc.steps || [],
      successRate: proc.successRate ?? 1.0,
      targetUrl: proc.targetUrl || null
    }))
  };
  return memory;
}

/**
 * Validate a memory object against the schema
 * @param {Object} memory
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMemory(memory) {
  const errors = [];

  if (!memory.id || typeof memory.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!Object.values(MEMORY_TYPES).includes(memory.type)) {
    errors.push(`Invalid type: ${memory.type}`);
  }
  if (!memory.text || typeof memory.text !== 'string') {
    errors.push('Missing or invalid text');
  }
  if (typeof memory.metadata !== 'object') {
    errors.push('Missing metadata object');
  }
  if (typeof memory.createdAt !== 'number') {
    errors.push('Missing createdAt timestamp');
  }

  return { valid: errors.length === 0, errors };
}

// Export for service worker (importScripts) and module contexts
if (typeof self !== 'undefined') {
  self.MEMORY_TYPES = MEMORY_TYPES;
  self.MEMORY_STORAGE_KEY = MEMORY_STORAGE_KEY;
  self.MEMORY_INDEX_KEY = MEMORY_INDEX_KEY;
  self.MEMORY_META_KEY = MEMORY_META_KEY;
  self.MAX_MEMORIES = MAX_MEMORIES;
  self.MAX_STORAGE_BYTES = MAX_STORAGE_BYTES;
  self.createBaseMemory = createBaseMemory;
  self.createSemanticMemory = createSemanticMemory;
  self.createProceduralMemory = createProceduralMemory;
  self.siteMapMemoryText = siteMapMemoryText;
  self.createSiteMapMemory = createSiteMapMemory;
  self.createTaskMemory = createTaskMemory;
  self.validateMemory = validateMemory;
}
