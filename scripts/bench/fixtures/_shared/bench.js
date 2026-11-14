/*
 * Phase 66 benchmark fixture helper, shared by every fixture app (D-15, D-17).
 *
 * Each page loads it as ../_shared/bench.js, a classic script placed just
 * before the page's own script, and carries <html data-bench-app="<slug>">.
 * Every URL built here is relative, so a request keeps the /r/<token>/ run
 * prefix the fixture server uses to attribute it to one run.
 *
 *   benchPost(action, body)  POSTs JSON to ../../api/<slug>/<action> and
 *                            resolves with the parsed {ok} reply.
 *   setMarker(name, value)   Sets the text of the [data-bench-marker=name]
 *                            element, creating a visible one if needed. The
 *                            runner reads markers after the timed window.
 *   setView(params)          Replaces the query string without navigating.
 *   onActivate(el, handler)  Runs handler on click, and on Enter or Space
 *                            for a custom control that is not a native one.
 *
 * Nothing here sends a request by itself: no timers, no observers, no
 * browser storage and no background requests, so a page never delays a
 * settle wait (Pitfall 9). Page state lives in memory only, because every
 * run shares one origin.
 *
 * One click, one activation: an automation tool may dispatch a click event
 * and then also call element.click() on the same element in the same
 * synchronous turn. A repeat click on an element already clicked in the
 * current turn (before the microtask queue drains) is cancelled here, so a
 * toggle is not flipped back and a save is not sent twice. Real input never
 * produces such a repeat.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const NAME = /^[a-z0-9-]{1,40}$/;
  const NATIVE_CONTROLS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'TEXTAREA']);

  function appSlug() {
    const slug = root.dataset.benchApp;
    if (typeof slug !== 'string' || !NAME.test(slug)) {
      throw new Error('bench: <html data-bench-app> is missing or invalid');
    }
    return slug;
  }

  async function benchPost(action, body) {
    if (typeof action !== 'string' || !NAME.test(action)) throw new Error('bench: invalid action');
    const response = await fetch(`../../api/${appSlug()}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`bench: request failed with status ${response.status}`);
    return response.json();
  }

  function setMarker(name, value) {
    if (typeof name !== 'string' || !NAME.test(name)) throw new Error('bench: invalid marker name');
    let marker = document.querySelector(`[data-bench-marker="${name}"]`);
    if (!marker) {
      marker = document.createElement('output');
      marker.dataset.benchMarker = name;
      (document.getElementById('bench-markers') || document.body).appendChild(marker);
    }
    marker.textContent = String(value);
    marker.hidden = false;
    return marker;
  }

  function setView(params) {
    history.replaceState(null, '', `?${new URLSearchParams(params)}`);
  }

  function onActivate(element, handler) {
    element.addEventListener('click', handler);
    if (NATIVE_CONTROLS.has(element.tagName)) return;
    element.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
        event.preventDefault();
        handler(event);
      }
    });
  }

  let clickedThisTurn = null;
  document.addEventListener('click', (event) => {
    if (clickedThisTurn === null) {
      clickedThisTurn = new Set();
      queueMicrotask(() => { clickedThisTurn = null; });
    }
    if (clickedThisTurn.has(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    clickedThisTurn.add(event.target);
  }, true);

  window.benchPost = benchPost;
  window.setMarker = setMarker;
  window.setView = setView;
  window.onActivate = onActivate;

  const markReady = () => { root.dataset.fixtureReady = 'true'; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markReady, { once: true });
  else markReady();
})();
