// Secure configuration management for Chrome Extension
// This file handles encrypted API keys and sensitive data

class SecureConfig {
  constructor() {
    // Configuration keys that should be encrypted
    this.sensitiveKeys = [
      'apiKey',
      'openaiApiKey',
      'geminiApiKey',
      'anthropicApiKey',
      'customApiKey',
      'captchaApiKey'
    ];

    // Runtime decrypted values (never persisted)
    this.decryptedValues = new Map();

    // PERF: Singleton TextEncoder/TextDecoder to avoid per-call instantiation
    this._encoder = new TextEncoder();
    this._decoder = new TextDecoder();

  }
  
  // Initialize with master password (stored in memory only)
  async initialize(masterPassword) {
    this.masterPassword = masterPassword;
    
    // Load and decrypt all sensitive values
    const stored = await chrome.storage.local.get();
    
    for (const [key, value] of Object.entries(stored)) {
      if (this.sensitiveKeys.includes(key) && this.isEncrypted(value)) {
        try {
          const decrypted = await this.decrypt(value, masterPassword);
          this.decryptedValues.set(key, decrypted);
        } catch (error) {
          console.error('Failed to decrypt config key:', error.message);
        }
      }
    }
  }
  
  // Check if a value is encrypted
  isEncrypted(value) {
    try {
      const parsed = JSON.parse(value);
      return parsed.encrypted && parsed.salt && parsed.iv;
    } catch {
      return false;
    }
  }
  
  // Get decrypted value
  async getSecureValue(key) {
    // First check runtime cache
    if (this.decryptedValues.has(key)) {
      return this.decryptedValues.get(key);
    }
    
    // Try to load and decrypt
    const stored = await chrome.storage.local.get(key);
    const value = stored[key];
    
    if (!value) return null;
    
    if (this.isEncrypted(value) && this.masterPassword) {
      const decrypted = await this.decrypt(value, this.masterPassword);
      this.decryptedValues.set(key, decrypted);
      return decrypted;
    }
    
    // Return as-is if not encrypted
    return value;
  }
  
  // Encrypt a value
  async encrypt(text, password) {
    const data = this._encoder.encode(text);

    // Generate salt and derive key
    const salt = crypto.getRandomValues(new Uint8Array(64));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this._encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 10000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Encrypt
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    return JSON.stringify({
      encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv))
    });
  }
  
  // Decrypt a value
  async decrypt(encryptedData, password) {
    const parsed = JSON.parse(encryptedData);

    // Decode base64
    const encrypted = Uint8Array.from(atob(parsed.encrypted), c => c.charCodeAt(0));
    const salt = Uint8Array.from(atob(parsed.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0));

    // Derive key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this._encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 10000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    return this._decoder.decode(decrypted);
  }
  
  // Save encrypted configuration
  async saveSecure(key, value, password) {
    if (this.sensitiveKeys.includes(key)) {
      const encrypted = await this.encrypt(value, password || this.masterPassword);
      await chrome.storage.local.set({ [key]: encrypted });
      this.decryptedValues.set(key, value);
    } else {
      await chrome.storage.local.set({ [key]: value });
    }
  }
  
  // Get all configuration with decrypted values
  async getAllSecure() {
    const stored = await chrome.storage.local.get();
    const config = {};
    
    for (const [key, value] of Object.entries(stored)) {
      if (this.sensitiveKeys.includes(key)) {
        config[key] = await this.getSecureValue(key) || '';
      } else {
        config[key] = value;
      }
    }
    
    return config;
  }
  
  // Clear decrypted values from memory
  clearCache() {
    this.decryptedValues.clear();
    this.masterPassword = null;
  }

  // ==========================================
  // Domain helpers (login detection)
  // ==========================================

  // Normalize a URL to its hostname, stripping 'www.' prefix
  normalizeDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      // Validate: must look like a domain (alphanumeric, dots, hyphens only, must contain a dot)
      if (!/^[a-zA-Z0-9.-]+$/.test(url) || !url.includes('.')) return url;
      return url.replace(/^www\./, '');
    }
  }

  // Check if a string is an IP address (v4 or v6)
  _isIPAddress(domain) {
    // IPv4: digits and dots only, 4 octets
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return true;
    // IPv6: contains colons
    if (domain.includes(':')) return true;
    return false;
  }

  // Common multi-level TLDs where the last two parts are the TLD
  static MULTI_LEVEL_TLDS = new Set([
    'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za', 'co.il',
    'com.br', 'com.au', 'com.mx', 'com.cn', 'com.tw', 'com.hk', 'com.sg',
    'com.ar', 'com.tr', 'com.eg', 'com.pk', 'com.ng', 'com.co',
    'gov.uk', 'gov.au', 'gov.in',
    'org.uk', 'org.au',
    'net.au', 'net.br',
    'ac.uk', 'ac.jp',
    'edu.au', 'edu.cn'
  ]);

  // Get parent domain (e.g., accounts.google.com -> google.com)
  getParentDomain(domain) {
    // No parent domain for IP addresses
    if (this._isIPAddress(domain)) return null;
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    // Check for multi-level TLDs (e.g., mail.google.co.uk -> google.co.uk)
    const lastTwo = parts.slice(-2).join('.');
    if (SecureConfig.MULTI_LEVEL_TLDS.has(lastTwo)) {
      return parts.length > 3 ? parts.slice(-3).join('.') : domain;
    }
    return lastTwo;
  }

  // ==========================================
  // Legacy vault (read-only, for the move to 1Password)
  // ==========================================
  //
  // FSB used to keep logins and cards in its own PIN-protected vault in
  // chrome.storage.local. 1Password replaced it: FSB no longer saves, lists, or
  // fills from this data. What is left lets a user read the old entries once
  // (with their PIN) so the background can hand them to the FSB local server
  // for import into 1Password, and then erase them.

  static LEGACY_CREDENTIAL_PREFIX = 'cred_';
  static LEGACY_PAYMENT_PREFIX = 'payment_method_';
  static LEGACY_VAULT_CONFIG_KEY = 'credentialVaultConfig';
  static LEGACY_VAULT_VERIFIER = 'FSB_CREDENTIAL_VAULT_V1';
  static LEGACY_SESSION_KEYS = ['fsbCredentialVaultSessionKey', 'fsbPaymentAccessUnlocked'];

  // Pre-vault credentials were encrypted with a key derived from the extension id.
  _legacyExtensionPassword() {
    const extId = chrome.runtime?.id || 'fsb-local';
    return 'fsb-cred-' + extId;
  }

  async _deriveLegacyVaultKey(pin, saltBase64) {
    const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this._encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }

  async _legacyEntries() {
    const all = await chrome.storage.local.get();
    const logins = [];
    const cards = [];
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(SecureConfig.LEGACY_CREDENTIAL_PREFIX)) logins.push([key, value]);
      else if (key.startsWith(SecureConfig.LEGACY_PAYMENT_PREFIX)) cards.push([key, value]);
    }
    return { config: all[SecureConfig.LEGACY_VAULT_CONFIG_KEY] || null, logins, cards };
  }

  // What is left of the old vault, without decrypting anything.
  async getLegacyVaultSummary() {
    const { config, logins, cards } = await this._legacyEntries();
    return {
      present: logins.length > 0 || cards.length > 0,
      pinProtected: !!config,
      pinLength: config?.pinLength || null,
      logins: logins.length,
      cards: cards.length
    };
  }

  // Decrypt every old entry with the user's PIN. Secrets stay in the service
  // worker; callers send them only to the FSB local server for import.
  async readLegacyVault(pin) {
    const { config, logins, cards } = await this._legacyEntries();
    let vaultKey = null;

    if (config) {
      if (!pin || !/^\d{4,6}$/.test(String(pin))) {
        return { success: false, errorCode: 'invalid_pin', error: 'Enter the PIN you used for the FSB vault' };
      }
      try {
        vaultKey = await this._deriveLegacyVaultKey(String(pin), config.salt);
        const verifier = await this.decrypt(config.verifier, vaultKey);
        if (verifier !== SecureConfig.LEGACY_VAULT_VERIFIER) throw new Error('verifier mismatch');
      } catch (_error) {
        return { success: false, errorCode: 'invalid_pin', error: 'Incorrect PIN' };
      }
    }

    const out = { success: true, logins: [], cards: [], unreadable: 0 };
    const legacyPassword = this._legacyExtensionPassword();

    for (const [key, value] of logins) {
      let decrypted = null;
      for (const password of [vaultKey, legacyPassword]) {
        if (!password) continue;
        try {
          decrypted = await this.decrypt(value, password);
          break;
        } catch (_error) {
          // Try the next key.
        }
      }
      if (!decrypted) {
        out.unreadable += 1;
        continue;
      }
      try {
        const data = JSON.parse(decrypted);
        out.logins.push({
          storageKey: key,
          domain: this.normalizeDomain(data?.domain || key.slice(SecureConfig.LEGACY_CREDENTIAL_PREFIX.length)),
          username: String(data?.username || ''),
          password: String(data?.password || ''),
          notes: String(data?.notes || ''),
          allowSubdomains: data?.allowSubdomains === true
        });
      } catch (_error) {
        out.unreadable += 1;
      }
    }

    for (const [key, value] of cards) {
      if (!vaultKey) {
        out.unreadable += 1;
        continue;
      }
      try {
        const data = JSON.parse(await this.decrypt(value, vaultKey));
        out.cards.push({
          storageKey: key,
          nickname: String(data?.nickname || ''),
          cardholderName: String(data?.cardholderName || ''),
          cardNumber: String(data?.cardNumber || '').replace(/\D/g, ''),
          expiryMonth: String(data?.expiryMonth || ''),
          expiryYear: String(data?.expiryYear || ''),
          cvv: String(data?.cvv || '').replace(/\D/g, ''),
          billingName: String(data?.billingName || ''),
          addressLine1: String(data?.addressLine1 || ''),
          addressLine2: String(data?.addressLine2 || ''),
          city: String(data?.city || ''),
          stateRegion: String(data?.stateRegion || ''),
          postalCode: String(data?.postalCode || ''),
          country: String(data?.country || '')
        });
      } catch (_error) {
        out.unreadable += 1;
      }
    }

    return out;
  }

  // Erase old vault entries. With no list, erases everything, including the
  // PIN verifier and any leftover session state.
  async purgeLegacyVault(storageKeys = null) {
    const { logins, cards } = await this._legacyEntries();
    const existing = new Set([...logins, ...cards].map(([key]) => key));
    const targets = Array.isArray(storageKeys)
      ? storageKeys.filter((key) => existing.has(key))
      : [...existing];
    if (targets.length > 0) await chrome.storage.local.remove(targets);

    const remaining = [...existing].filter((key) => !targets.includes(key));
    if (remaining.length === 0) {
      await chrome.storage.local.remove(SecureConfig.LEGACY_VAULT_CONFIG_KEY);
      try {
        await chrome.storage.session?.remove(SecureConfig.LEGACY_SESSION_KEYS);
      } catch (_error) {
        // Session storage may be unavailable; it clears on browser restart anyway.
      }
    }
    return { success: true, removed: targets.length, remaining: remaining.length };
  }
}

// Export singleton
const secureConfig = new SecureConfig();

if (typeof self !== 'undefined') {
  self.secureConfig = secureConfig;
}

if (typeof window !== 'undefined') {
  window.BrowserAgentSecureConfig = secureConfig;
}
