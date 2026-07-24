/**
 * AI Provider implementations for FSB v0.9.91
 * This module now uses the universal provider for model-agnostic support
 */

// Import universal provider
if (typeof importScripts !== 'undefined') {
  importScripts('ai/universal-provider.js');
}

/**
 * Factory function to create appropriate provider instance
 * Now always returns UniversalProvider for true model agnosticism
 * @param {Object} settings - Configuration settings
 * @returns {UniversalProvider} Provider instance
 */
function createAIProvider(settings) {
  // Always use UniversalProvider regardless of provider type
  return new UniversalProvider(settings);
}

// For backward compatibility, create wrapper classes that delegate to UniversalProvider
class AIProvider extends UniversalProvider {
  constructor(settings) {
    super(settings);
  }
}

class XAIProvider extends UniversalProvider {
  constructor(settings) {
    super({ ...settings, modelProvider: 'xai' });
  }
}

class GeminiProvider extends UniversalProvider {
  constructor(settings) {
    super({ ...settings, modelProvider: 'gemini' });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIProvider, XAIProvider, GeminiProvider, createAIProvider };
}
