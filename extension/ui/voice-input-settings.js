// Microphone permission status and recovery actions for the control panel.
// The feature toggle is persisted by options.js; Chrome remains the authority
// for the extension origin's actual microphone permission.

(() => {
  'use strict';

  const PERMISSION_PAGE = 'ui/microphone-permission.html';
  const MICROPHONE_SETTINGS_URL = 'chrome://settings/content/microphone';

  function setHidden(element, hidden) {
    if (element) element.hidden = hidden;
  }

  function setButtonLabel(button, label) {
    if (!button) return;
    const labelElement = button.querySelector?.('span');
    if (labelElement) labelElement.textContent = label;
    else button.textContent = label;
  }

  class VoiceInputSettingsController {
    constructor(options = {}) {
      this.statusElement = options.statusElement || null;
      this.detailElement = options.detailElement || null;
      this.permissionButton = options.permissionButton || null;
      this.settingsButton = options.settingsButton || null;
      this.permissions = options.permissions || globalThis.navigator?.permissions || null;
      this.mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices || null;
      this.tabs = options.tabs || globalThis.chrome?.tabs || null;
      this.runtime = options.runtime || globalThis.chrome?.runtime || null;
      this.onError = typeof options.onError === 'function' ? options.onError : () => {};

      this.permissionStatus = null;
      this.permissionState = 'checking';
      this._permissionChangeHandler = null;
      this._initialized = false;
    }

    init() {
      if (!this._initialized) {
        this._initialized = true;
        this.permissionButton?.addEventListener('click', () => {
          void this.openPermissionPage();
        });
        this.settingsButton?.addEventListener('click', () => {
          void this.openChromeSettings();
        });
      }
      return this.refreshPermissionStatus();
    }

    async refreshPermissionStatus() {
      if (typeof this.mediaDevices?.getUserMedia !== 'function') {
        this._render('unavailable');
        return this.permissionState;
      }

      if (typeof this.permissions?.query !== 'function') {
        this._render(
          'prompt',
          'Chrome will confirm microphone access on the FSB permission page.'
        );
        return this.permissionState;
      }

      this._render('checking');
      try {
        const status = await this.permissions.query({ name: 'microphone' });
        this._watchPermissionStatus(status);
        this._render(status?.state);
      } catch (_error) {
        this._render(
          'prompt',
          'Chrome will confirm microphone access on the FSB permission page.'
        );
      }
      return this.permissionState;
    }

    async handleSavedChange(previousEnabled, nextEnabled) {
      if (previousEnabled !== false || nextEnabled !== true) return false;
      const state = await this.refreshPermissionStatus();
      if (state === 'granted' || state === 'unavailable') return false;
      await this.openPermissionPage();
      return true;
    }

    async openPermissionPage() {
      if (typeof this.tabs?.create !== 'function' || typeof this.runtime?.getURL !== 'function') {
        this.onError('Chrome could not open the FSB microphone permission page');
        return false;
      }
      try {
        await this.tabs.create({
          url: this.runtime.getURL(PERMISSION_PAGE),
          active: true
        });
        return true;
      } catch (_error) {
        this.onError('Chrome could not open the FSB microphone permission page');
        return false;
      }
    }

    async openChromeSettings() {
      if (typeof this.tabs?.create !== 'function') {
        this.onError('Open chrome://settings/content/microphone to manage microphone access');
        return false;
      }
      try {
        await this.tabs.create({ url: MICROPHONE_SETTINGS_URL, active: true });
        return true;
      } catch (_error) {
        this.onError('Open chrome://settings/content/microphone to manage microphone access');
        return false;
      }
    }

    _watchPermissionStatus(status) {
      if (this.permissionStatus && this._permissionChangeHandler) {
        this.permissionStatus.removeEventListener?.('change', this._permissionChangeHandler);
      }
      this.permissionStatus = status || null;
      this._permissionChangeHandler = () => this._render(this.permissionStatus?.state);
      this.permissionStatus?.addEventListener?.('change', this._permissionChangeHandler);
    }

    _render(rawState, detailOverride = '') {
      const state = ['granted', 'prompt', 'denied', 'unavailable', 'checking'].includes(rawState)
        ? rawState
        : 'prompt';
      const presentation = {
        checking: {
          label: 'Checking microphone permission…',
          detail: 'Chrome manages the extension-wide microphone grant.',
          permissionAction: '',
          showSettings: false
        },
        granted: {
          label: 'Microphone permission: Allowed',
          detail: 'FSB can use this grant from the side panel on every website.',
          permissionAction: '',
          showSettings: true
        },
        prompt: {
          label: 'Microphone permission: Setup required',
          detail: 'Allow access once for the FSB extension; Chrome remembers the choice.',
          permissionAction: 'Enable microphone',
          showSettings: false
        },
        denied: {
          label: 'Microphone permission: Blocked',
          detail: 'Review the recovery instructions or remove FSB from Chrome’s blocked list.',
          permissionAction: 'Review microphone access',
          showSettings: true
        },
        unavailable: {
          label: 'Microphone permission: Unavailable',
          detail: 'This browser does not provide microphone access to extension pages.',
          permissionAction: '',
          showSettings: false
        }
      }[state];

      this.permissionState = state;
      if (this.statusElement) {
        this.statusElement.dataset.state = state;
        this.statusElement.textContent = presentation.label;
      }
      if (this.detailElement) {
        this.detailElement.textContent = detailOverride || presentation.detail;
      }
      setButtonLabel(this.permissionButton, presentation.permissionAction);
      setHidden(this.permissionButton, !presentation.permissionAction);
      setHidden(this.settingsButton, !presentation.showSettings);
    }
  }

  globalThis.FSBVoiceInputSettings = Object.freeze({
    VoiceInputSettingsController,
    PERMISSION_PAGE,
    MICROPHONE_SETTINGS_URL
  });
})();
