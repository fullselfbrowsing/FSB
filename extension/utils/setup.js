// Setup script for FSB - Chrome Extension Compatible
// This provides setup utilities that work in the browser context

/**
 * Browser-compatible setup utilities for FSB Chrome Extension
 * Use this to programmatically configure the extension or test settings
 */
class FSBSetup {
  constructor() {
    this.defaultSettings = {
      modelProvider: 'xai',
      modelName: 'grok-3-fast',
      apiKey: '',
      geminiApiKey: '',
      captchaSolver: 'none',
      captchaApiKey: '',
      actionDelay: 1000,
      maxIterations: 100,
      confirmSensitive: true,
      debugMode: false
    };
  }

  /**
   * Load current settings from Chrome storage
   */
  async loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      throw new Error('This setup script must run in a Chrome extension context');
    }
    
    const settings = await chrome.storage.local.get();
    console.log('Current settings:', settings);
    return settings;
  }

  /**
   * Save settings to Chrome storage
   */
  async saveSettings(settings) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      throw new Error('This setup script must run in a Chrome extension context');
    }
    
    console.log('Saving settings:', settings);
    await chrome.storage.local.set(settings);
    console.log('Settings saved successfully');
  }

  /**
   * Quick setup for xAI Grok
   */
  async setupXAI(apiKey, modelName = 'grok-3-fast') {
    const settings = {
      ...this.defaultSettings,
      modelProvider: 'xai',
      modelName: modelName,
      apiKey: apiKey
    };
    
    await this.saveSettings(settings);
    console.log('✅ xAI setup complete');
    return settings;
  }

  /**
   * Quick setup for Google Gemini
   */
  async setupGemini(apiKey, modelName = 'gemini-2.0-flash') {
    const settings = {
      ...this.defaultSettings,
      modelProvider: 'gemini',
      modelName: modelName,
      geminiApiKey: apiKey
    };
    
    await this.saveSettings(settings);
    console.log('✅ Gemini setup complete');
    return settings;
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings() {
    await this.saveSettings(this.defaultSettings);
    console.log('✅ Settings reset to defaults');
    return this.defaultSettings;
  }

  /**
   * Test API connection with current settings
   */
  async testConnection() {
    const settings = await this.loadSettings();
    
    if (!settings.apiKey && !settings.geminiApiKey) {
      console.error('❌ No API keys configured');
      return false;
    }

    try {
      // Use the existing AI integration for testing
      if (typeof AIIntegration !== 'undefined') {
        const ai = new AIIntegration(settings);
        const result = await ai.testConnection();
        
        if (result.ok) {
          console.log('✅ API connection successful:', result);
          return true;
        } else {
          console.error('❌ API connection failed:', result);
          return false;
        }
      } else {
        console.warn('⚠️ AIIntegration not available for testing');
        return null;
      }
    } catch (error) {
      console.error('❌ Connection test error:', error);
      return false;
    }
  }

  /**
   * Display current configuration status
   */
  async showStatus() {
    const settings = await this.loadSettings();
    
    console.log('\n=== FSB Configuration Status ===');
    console.log(`Provider: ${settings.modelProvider || 'Not set'}`);
    console.log(`Model: ${settings.modelName || 'Not set'}`);
    console.log(`xAI API Key: ${settings.apiKey ? '✅ Configured' : '❌ Not set'}`);
    console.log(`Gemini API Key: ${settings.geminiApiKey ? '✅ Configured' : '❌ Not set'}`);
    console.log(`CAPTCHA Solver: ${settings.captchaSolver || 'none'}`);
    console.log(`Debug Mode: ${settings.debugMode ? 'Enabled' : 'Disabled'}`);
    console.log('===============================\n');
    
    return settings;
  }

  /**
   * Interactive setup guide (for console use)
   */
  async interactiveSetup() {
    console.log('🚀 FSB Interactive Setup');
    console.log('For full configuration, please use the extension options page.');
    console.log('This console setup is for quick API key configuration only.\n');
    
    const settings = await this.loadSettings();
    
    // Show current status
    await this.showStatus();
    
    console.log('Quick setup options:');
    console.log('1. setupXAI("your_xai_api_key")');
    console.log('2. setupGemini("your_gemini_api_key")');
    console.log('3. resetSettings()');
    console.log('4. testConnection()');
    console.log('\nFor full configuration, open chrome-extension://[extension-id]/control_panel.html');
    
    return settings;
  }
}

// Create global instance for console use
if (typeof window !== 'undefined') {
  window.fsbSetup = new FSBSetup();
  console.log('FSB Setup utilities loaded. Use window.fsbSetup for configuration.');
  console.log('Quick start: fsbSetup.interactiveSetup()');
} else if (typeof global !== 'undefined') {
  global.fsbSetup = new FSBSetup();
  console.log('FSB Setup utilities loaded. Use fsbSetup for configuration.');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FSBSetup;
}