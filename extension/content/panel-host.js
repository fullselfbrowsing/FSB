/**
 * In-page panel host.
 *
 * Safari has no side panel for extensions, so there the platform adapter asks
 * this script to show FSB's panel page inside the web page instead: an iframe
 * pinned to the left edge, in the top layer, with the page's own content moved
 * out from under it. Chrome never sends these messages, so on Chrome this file
 * only registers a listener that stays silent.
 *
 * Messages (from the service worker, main frame only):
 *   fsbPanelShow  { url, width }  -> { success, shown }
 *   fsbPanelHide                  -> { success, shown: false }
 *   fsbPanelState                 -> { success, shown }
 *
 * The frame's URL comes from the worker and must be this extension's own. A
 * page script cannot build one: Safari masks extension URLs from page scripts.
 * The shadow root is closed, so the page cannot reach the frame either.
 */
(function () {
  'use strict';

  // Content scripts are re-injected into tabs that already run them.
  if (window.__FSB_PANEL_HOST__) return;
  window.__FSB_PANEL_HOST__ = true;

  var HOST_ID = 'fsb-panel-host';
  var INSET_PROPERTY = '--fsb-panel-inset';
  var DEFAULT_WIDTH = 420;
  var MIN_PAGE_WIDTH = 480;

  var host = null;
  var reserved = null;   // the page's own inline margin-left, while ours replaces it

  function isShown() {
    return !!(host && host.isConnected);
  }

  function ownUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try { return url.indexOf(chrome.runtime.getURL('')) === 0; } catch (_e) { return false; }
  }

  // Wide enough to use, never more than the window can spare.
  function panelWidth(wanted) {
    var width = typeof wanted === 'number' && wanted > 0 ? wanted : DEFAULT_WIDTH;
    var room = (window.innerWidth || 0) - MIN_PAGE_WIDTH;
    if (room > 0 && width > room) width = Math.max(280, room);
    return Math.round(width);
  }

  // Page content moves out from under the panel, and the glow that frames the
  // page while an agent works (visual-feedback.js reads the same property)
  // starts after it. FSB's other overlays sit in the right-hand corners.
  function reserve(width) {
    var root = document.documentElement;
    if (!root) return;
    if (reserved === null) {
      reserved = {
        value: root.style.getPropertyValue('margin-left'),
        priority: root.style.getPropertyPriority('margin-left')
      };
    }
    root.style.setProperty('margin-left', width + 'px', 'important');
    root.style.setProperty(INSET_PROPERTY, width + 'px');
  }

  function release() {
    var root = document.documentElement;
    if (!root || reserved === null) return;
    if (reserved.value) root.style.setProperty('margin-left', reserved.value, reserved.priority);
    else root.style.removeProperty('margin-left');
    root.style.removeProperty(INSET_PROPERTY);
    reserved = null;
  }

  function show(url, wanted) {
    if (!ownUrl(url)) return false;
    if (isShown()) return true;
    if (!document.documentElement) return false;
    var width = panelWidth(wanted);

    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-fsb-overlay', 'panel-host');
    host.style.cssText = [
      'all: initial',
      'display: block',
      'position: fixed',
      'inset: auto',
      'top: 0',
      'left: 0',
      'bottom: 0',
      'width: ' + width + 'px',
      'height: 100%',
      'max-width: none',
      'max-height: none',
      'margin: 0',
      'padding: 0',
      'border: none',
      'background: none',
      'overflow: visible',
      'z-index: 2147483647'
    ].join(' !important; ') + ' !important;';

    var shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = [
      ':host { display: block !important; }',
      'iframe { display: block; width: 100%; height: 100%; border: 0; margin: 0; padding: 0;',
      '  background: Canvas; color-scheme: light dark;',
      '  box-shadow: 1px 0 0 rgba(128, 128, 128, 0.35), 8px 0 24px rgba(0, 0, 0, 0.12); }'
    ].join('\n');
    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'FSB');
    frame.setAttribute('allow', 'clipboard-write; microphone');
    frame.src = url;
    shadow.appendChild(style);
    shadow.appendChild(frame);

    document.documentElement.appendChild(host);
    // The top layer keeps the panel above the page's own dialogs and menus.
    if (typeof host.showPopover === 'function') {
      try {
        host.setAttribute('popover', 'manual');
        host.showPopover();
      } catch (_e) {
        host.removeAttribute('popover');
      }
    }
    reserve(width);
    return true;
  }

  function hide() {
    if (host) {
      try { host.remove(); } catch (_e) { /* already gone */ }
    }
    host = null;
    release();
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    var action = message && message.action;
    if (action !== 'fsbPanelShow' && action !== 'fsbPanelHide' && action !== 'fsbPanelState') return undefined;
    // Only the extension's own worker may place or remove the panel.
    if (sender && sender.id && sender.id !== chrome.runtime.id) return undefined;
    try {
      if (action === 'fsbPanelShow') show(message.url, message.width);
      else if (action === 'fsbPanelHide') hide();
      sendResponse({ success: true, shown: isShown() });
    } catch (error) {
      sendResponse({ success: false, shown: isShown(), error: String((error && error.message) || error) });
    }
    return undefined;
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { show: show, hide: hide, isShown: isShown };
  }
})();
