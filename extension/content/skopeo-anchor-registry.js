// Immutable semantic anchors with revocable, viewport-bounded DOM bindings.
(function () {
  'use strict';

  const IDENTITY_KIND = Object.freeze({
    DRIVE_FOLDER: 'drive-folder',
    DRIVE_FILE: 'drive-file',
    DOCS_DOCUMENT: 'docs-document',
    OPAQUE_TARGET: 'opaque-target'
  });
  const LOCATOR_KIND = Object.freeze({
    DRIVE_ITEM_ID: 'drive-item-id',
    DOCS_DOCUMENT_ID: 'docs-document-id',
    OPAQUE_TARGET_KEY: 'opaque-target-key'
  });
  const BINDING_REASON = Object.freeze({
    MANUAL: 'manual',
    REBIND: 'rebind',
    CONTEXT_CHANGED: 'context-changed',
    NAVIGATION: 'navigation',
    SEMANTIC_MISMATCH: 'semantic-mismatch',
    DISCONNECTED: 'disconnected',
    GEOMETRY_UNSAFE: 'geometry-unsafe',
    INVALID_CANDIDATE: 'invalid-candidate',
    CALLBACK_ERROR: 'callback-error',
    DISPOSED: 'disposed'
  });

  const DESCRIPTOR_KEYS = Object.freeze([
    'anchorId',
    'contextEpoch',
    'semanticIdentity',
    'candidateLocators',
    'validators'
  ]);
  const IDENTITY_KEYS = Object.freeze(['kind', 'id']);
  const LOCATOR_KEYS = Object.freeze(['kind', 'value']);
  const VALIDATORS = Object.freeze(['semantic-identity', 'connected', 'geometry']);
  const SIGNALS = Object.freeze(['mutation', 'scroll', 'resize', 'zoom', 'navigation']);
  const IDENTITY_VALUES = new Set(Object.values(IDENTITY_KIND));
  const LOCATOR_VALUES = new Set(Object.values(LOCATOR_KIND));
  const VALIDATOR_VALUES = new Set(VALIDATORS);
  const SIGNAL_VALUES = new Set(SIGNALS);
  const MAX_TEXT_LENGTH = 512;
  const MAX_LOCATORS = 8;
  const MAX_CANDIDATES = 32;

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isPositiveSafeInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  function exactKeys(value, expected, label) {
    if (!isRecord(value)) throw new TypeError(label + ' must be an object');
    const keys = Object.keys(value).sort();
    const allowed = expected.slice().sort();
    if (keys.length !== allowed.length || keys.some(function (key, index) { return key !== allowed[index]; })) {
      throw new TypeError(label + ' has an unknown or missing key');
    }
  }

  function boundedText(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
      throw new TypeError(label + ' must be a nonempty string of at most 512 characters');
    }
    return value;
  }

  function looksLikeSelector(value) {
    const text = String(value);
    return /^[.#\[*+>~:]|\b(?:querySelector|querySelectorAll|xpath)\b/i.test(text) ||
      /\[(?:class|style|role|data-[^\]]+)\s*[~|^$*]?=/i.test(text);
  }

  function normalizeIdentity(value) {
    exactKeys(value, IDENTITY_KEYS, 'semanticIdentity');
    if (!IDENTITY_VALUES.has(value.kind)) throw new TypeError('semanticIdentity has an unknown kind');
    const id = boundedText(value.id, 'semanticIdentity.id');
    if (looksLikeSelector(id)) throw new TypeError('semanticIdentity.id cannot contain a page selector');
    return Object.freeze({ kind: value.kind, id: id });
  }

  function normalizeLocator(value) {
    exactKeys(value, LOCATOR_KEYS, 'candidate locator');
    if (!LOCATOR_VALUES.has(value.kind)) throw new TypeError('candidate locator has an unknown kind');
    const locatorValue = boundedText(value.value, 'candidate locator value');
    if (looksLikeSelector(locatorValue)) throw new TypeError('candidate locator cannot contain a page selector');
    return Object.freeze({ kind: value.kind, value: locatorValue });
  }

  function normalizeDescriptor(input) {
    exactKeys(input, DESCRIPTOR_KEYS, 'anchor descriptor');
    const anchorId = boundedText(input.anchorId, 'anchorId');
    if (looksLikeSelector(anchorId)) throw new TypeError('anchorId cannot contain a page selector');
    if (!isPositiveSafeInteger(input.contextEpoch)) {
      throw new TypeError('contextEpoch must be a positive safe integer');
    }
    const identity = normalizeIdentity(input.semanticIdentity);
    if (!Array.isArray(input.candidateLocators) || input.candidateLocators.length === 0 ||
        input.candidateLocators.length > MAX_LOCATORS) {
      throw new TypeError('candidate locator count must be between 1 and 8');
    }
    const locators = input.candidateLocators.map(normalizeLocator);
    const locatorKeys = new Set();
    const locatorKinds = new Set();
    for (const locator of locators) {
      const key = locator.kind + '\u0000' + locator.value;
      if (locatorKeys.has(key)) throw new TypeError('duplicate candidate locator');
      if (locatorKinds.has(locator.kind)) throw new TypeError('duplicate candidate locator kind');
      locatorKeys.add(key);
      locatorKinds.add(locator.kind);
    }
    if (!Array.isArray(input.validators) || input.validators.length === 0) {
      throw new TypeError('validators must be a nonempty array');
    }
    const validators = [];
    const seenValidators = new Set();
    for (const validator of input.validators) {
      if (!VALIDATOR_VALUES.has(validator)) throw new TypeError('unknown anchor validator');
      if (seenValidators.has(validator)) throw new TypeError('duplicate anchor validator');
      seenValidators.add(validator);
      validators.push(validator);
    }
    return Object.freeze({
      anchorId: anchorId,
      contextEpoch: input.contextEpoch,
      semanticIdentity: identity,
      candidateLocators: Object.freeze(locators.slice()),
      validators: Object.freeze(validators)
    });
  }

  function sameIdentity(left, right) {
    return !!left && !!right && left.kind === right.kind && left.id === right.id;
  }

  function thenable(value) {
    return !!value && (typeof value === 'object' || typeof value === 'function') &&
      typeof value.then === 'function';
  }

  function freezeRect(value) {
    if (!value || typeof value !== 'object') return null;
    const left = Number(value.left);
    const top = Number(value.top);
    const width = Number(value.width);
    const height = Number(value.height);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const right = left + width;
    const bottom = top + height;
    if (![right, bottom].every(Number.isFinite)) return null;
    return Object.freeze({
      left: left,
      top: top,
      width: width,
      height: height,
      right: right,
      bottom: bottom
    });
  }

  class AnchorRegistry {
    constructor(options) {
      const settings = options || {};
      if (!isPositiveSafeInteger(settings.generation)) {
        throw new TypeError('createRegistry requires a positive generation');
      }
      if (!settings.signal || typeof settings.signal.aborted !== 'boolean') {
        throw new TypeError('createRegistry requires an AbortSignal');
      }
      if (!settings.window || typeof settings.window.addEventListener !== 'function' ||
          typeof settings.window.requestAnimationFrame !== 'function' ||
          typeof settings.window.cancelAnimationFrame !== 'function') {
        throw new TypeError('createRegistry requires an injected window and frame scheduler');
      }
      if (!settings.document || !settings.observationRoot) {
        throw new TypeError('createRegistry requires an injected document and observationRoot');
      }
      if (!settings.resourceLedger || typeof settings.resourceLedger.acquire !== 'function' ||
          typeof settings.resourceLedger.release !== 'function' ||
          typeof settings.resourceLedger.snapshot !== 'function') {
        throw new TypeError('createRegistry requires an injected resource ledger');
      }
      for (const callbackName of ['resolveCandidates', 'validateCandidate', 'isCurrent', 'onWithdraw', 'onCommit']) {
        if (typeof settings[callbackName] !== 'function') {
          throw new TypeError('createRegistry requires ' + callbackName);
        }
      }

      this.window = settings.window;
      this.document = settings.document;
      this.observationRoot = settings.observationRoot;
      this.abortSignal = settings.signal;
      this.ledger = settings.resourceLedger;
      this.resolveCandidates = settings.resolveCandidates;
      this.validateCandidate = settings.validateCandidate;
      this.isCurrent = settings.isCurrent;
      this.onWithdraw = settings.onWithdraw;
      this.onCommit = settings.onCommit;
      this.generation = settings.generation;
      this.contextEpoch = null;
      this.disposed = false;
      this.states = new Map();
      this.ownedHandles = [];
      this.pendingOperations = new Set();
      this.observer = null;
      this.observerHandle = null;
      this.frameId = null;
      this.frameHandle = null;
      this.pendingSignals = new Set();

      try {
        this._installObservation();
        this._installListeners();
      } catch (error) {
        this.dispose();
        throw error;
      }
    }

    _acquire(category, cleanup, detail) {
      const handle = this.ledger.acquire(category, cleanup, detail);
      this.ownedHandles.push(handle);
      return handle;
    }

    _release(handle, runCleanup) {
      if (!handle) return false;
      try {
        this.ledger.release(handle, {
          cleanup: runCleanup !== false,
          suppressCleanupError: true
        });
      } catch (_error) {
        return false;
      }
      const index = this.ownedHandles.indexOf(handle);
      if (index >= 0) this.ownedHandles.splice(index, 1);
      return true;
    }

    _listen(target, type, callback, options) {
      if (!target || typeof target.addEventListener !== 'function') return null;
      target.addEventListener(type, callback, options);
      const registry = this;
      return this._acquire('listeners', function () {
        target.removeEventListener(type, callback, options);
      }, type + ' anchor signal');
    }

    _installObservation() {
      const Observer = this.window.MutationObserver;
      if (typeof Observer !== 'function') throw new TypeError('createRegistry requires an injected MutationObserver');
      const registry = this;
      const observer = new Observer(function () {
        registry.signal('mutation');
      });
      observer.observe(this.observationRoot, {
        subtree: true,
        childList: true,
        attributes: true
      });
      this.observer = observer;
      this.observerHandle = this._acquire('observers', function () {
        observer.disconnect();
      }, 'bounded semantic anchor observer');
    }

    _installListeners() {
      const registry = this;
      this._listen(this.window, 'scroll', function () { registry.signal('scroll'); }, true);
      this._listen(this.window, 'resize', function () { registry.signal('resize'); }, false);
      this._listen(this.window, 'popstate', function () { registry.signal('navigation'); }, false);
      this._listen(this.window, 'hashchange', function () { registry.signal('navigation'); }, false);
      const viewport = this.window.visualViewport;
      if (viewport) {
        this._listen(viewport, 'resize', function () { registry.signal('zoom'); }, false);
        this._listen(viewport, 'scroll', function () { registry.signal('scroll'); }, false);
      }
      if (typeof this.abortSignal.addEventListener === 'function') {
        const onAbort = function () { registry.dispose(); };
        this.abortSignal.addEventListener('abort', onAbort, { once: true });
        this._acquire('listeners', function () {
          registry.abortSignal.removeEventListener('abort', onAbort, { once: true });
        }, 'registry AbortSignal boundary');
      }
      if (this.abortSignal.aborted) this.dispose();
    }

    _advanceEpoch(state) {
      const next = state.bindingEpoch + 1;
      if (!Number.isSafeInteger(next) || next <= 0) {
        this.dispose();
        throw new Error('semantic anchor bindingEpoch exhausted');
      }
      state.bindingEpoch = next;
      return next;
    }

    _tuple(state, epoch) {
      // This exact four-part tuple is the only asynchronous commit authority.
      return Object.freeze({ generation: this.generation, contextEpoch: this.contextEpoch, semanticIdentity: state.descriptor.semanticIdentity, bindingEpoch: epoch });
    }

    _tupleIsCurrent(state, tuple) {
      if (this.disposed || this.abortSignal.aborted || !state || !tuple) return false;
      if (tuple.generation !== this.generation || tuple.contextEpoch !== this.contextEpoch ||
          tuple.bindingEpoch !== state.bindingEpoch ||
          !sameIdentity(tuple.semanticIdentity, state.descriptor.semanticIdentity) ||
          state.descriptor.contextEpoch !== this.contextEpoch) {
        return false;
      }
      try {
        return this.isCurrent(tuple) === true;
      } catch (_error) {
        return false;
      }
    }

    _candidateParts(candidate) {
      if (!isRecord(candidate) || (candidate.kind !== 'node' && candidate.kind !== 'range')) return null;
      for (const forbidden of ['selector', 'cssSelector', 'html', 'innerHTML', 'outerHTML', 'text', 'label']) {
        if (own(candidate, forbidden)) return null;
      }
      const target = candidate.target;
      if (!target || typeof target.getBoundingClientRect !== 'function') return null;
      if (candidate.kind === 'range') {
        const node = target.commonAncestorContainer;
        if (!node || typeof node !== 'object') return null;
        return { candidate: candidate, target: target, node: node, range: true };
      }
      return { candidate: candidate, target: target, node: target, range: false };
    }

    _connected(parts) {
      if (!parts || parts.node.isConnected !== true) return false;
      if (parts.range) {
        if (!parts.target.startContainer || !parts.target.endContainer) return false;
        if (parts.target.startContainer.isConnected === false || parts.target.endContainer.isConnected === false) return false;
      }
      if (typeof this.observationRoot.contains === 'function' &&
          parts.node !== this.observationRoot && !this.observationRoot.contains(parts.node)) {
        return false;
      }
      return true;
    }

    _safeRect(parts) {
      if (!parts || typeof parts.target.getBoundingClientRect !== 'function') return null;
      let value;
      try {
        value = parts.target.getBoundingClientRect();
      } catch (_error) {
        return null;
      }
      const targetRect = freezeRect(value);
      if (!targetRect) return null;
      const viewport = this.window.visualViewport;
      const viewportLeft = viewport && Number.isFinite(Number(viewport.offsetLeft))
        ? Number(viewport.offsetLeft)
        : 0;
      const viewportTop = viewport && Number.isFinite(Number(viewport.offsetTop))
        ? Number(viewport.offsetTop)
        : 0;
      const viewportWidth = viewport && Number.isFinite(Number(viewport.width)) && Number(viewport.width) > 0
        ? Number(viewport.width)
        : Number(this.window.innerWidth);
      const viewportHeight = viewport && Number.isFinite(Number(viewport.height)) && Number(viewport.height) > 0
        ? Number(viewport.height)
        : Number(this.window.innerHeight);
      if (![viewportLeft, viewportTop, viewportWidth, viewportHeight].every(Number.isFinite) ||
          viewportWidth <= 0 || viewportHeight <= 0) return null;
      if (targetRect.left < viewportLeft || targetRect.top < viewportTop ||
          targetRect.right > viewportLeft + viewportWidth ||
          targetRect.bottom > viewportTop + viewportHeight) {
        return null;
      }
      return targetRect;
    }

    _proofMatches(proof, descriptor) {
      if (!isRecord(proof) || Object.keys(proof).length !== 1 || !own(proof, 'semanticIdentity')) return false;
      const identity = proof.semanticIdentity;
      return isRecord(identity) && Object.keys(identity).length === 2 &&
        own(identity, 'kind') && own(identity, 'id') &&
        sameIdentity(identity, descriptor.semanticIdentity);
    }

    _validateSync(state, candidate) {
      const parts = this._candidateParts(candidate);
      if (!parts) return { ok: false, reason: BINDING_REASON.INVALID_CANDIDATE };
      if (!this._connected(parts)) return { ok: false, reason: BINDING_REASON.DISCONNECTED };
      let proof;
      try {
        proof = this.validateCandidate(candidate, state.descriptor, this._tuple(state, state.bindingEpoch));
      } catch (_error) {
        return { ok: false, reason: BINDING_REASON.CALLBACK_ERROR };
      }
      if (thenable(proof)) {
        Promise.resolve(proof).catch(function () {});
        return { ok: false, reason: BINDING_REASON.INVALID_CANDIDATE };
      }
      if (!this._proofMatches(proof, state.descriptor)) {
        return { ok: false, reason: BINDING_REASON.SEMANTIC_MISMATCH };
      }
      const targetRect = this._safeRect(parts);
      if (!targetRect) return { ok: false, reason: BINDING_REASON.GEOMETRY_UNSAFE };
      return { ok: true, targetRect: targetRect };
    }

    _withdrawState(state, reason, forceNotice) {
      if (!state) return false;
      const hadBinding = !!state.binding;
      state.binding = null;
      const bindingEpoch = this._advanceEpoch(state);
      if (hadBinding || forceNotice === true) {
        try {
          this.onWithdraw(Object.freeze({
            anchorId: state.descriptor.anchorId,
            reason: reason,
            bindingEpoch: bindingEpoch
          }));
        } catch (_error) {
          // Authority is already withdrawn; visual callback failure cannot restore it.
        }
      }
      return hadBinding;
    }

    _commitProjection(state, targetRect) {
      const tuple = this._tuple(state, state.bindingEpoch);
      if (!this._tupleIsCurrent(state, tuple)) return false;
      const projection = Object.freeze({
        generation: tuple.generation,
        contextEpoch: tuple.contextEpoch,
        semanticIdentity: tuple.semanticIdentity,
        bindingEpoch: tuple.bindingEpoch,
        targetRect: targetRect
      });
      // Final authority is intentionally repeated immediately at the side effect.
      if (!this._tupleIsCurrent(state, tuple)) return false;
      try {
        const accepted = this.onCommit(projection);
        if (accepted === false) {
          this._withdrawState(state, BINDING_REASON.CALLBACK_ERROR, false);
          return false;
        }
        return true;
      } catch (_error) {
        this._withdrawState(state, BINDING_REASON.CALLBACK_ERROR, false);
        return false;
      }
    }

    _commitExisting(state) {
      if (!state.binding) return false;
      const first = this._validateSync(state, state.binding.candidate);
      if (!first.ok) {
        this._withdrawState(state, first.reason, false);
        return false;
      }
      const second = this._validateSync(state, state.binding.candidate);
      if (!second.ok) {
        this._withdrawState(state, second.reason, false);
        return false;
      }
      state.binding.geometryCertificate = second.targetRect;
      return this._commitProjection(state, second.targetRect);
    }

    _releaseOperation(operation) {
      if (!operation || !operation.handle) return;
      const handle = operation.handle;
      operation.handle = null;
      this._release(handle, false);
      this.pendingOperations.delete(operation);
    }

    _resolveState(state) {
      if (this.disposed || this.abortSignal.aborted || !state ||
          !this.contextEpoch || state.descriptor.contextEpoch !== this.contextEpoch) return false;
      if (state.binding) this._withdrawState(state, BINDING_REASON.REBIND, false);
      const bindingEpoch = this._advanceEpoch(state);
      const tuple = this._tuple(state, bindingEpoch);
      const request = Object.freeze({
        anchorId: state.descriptor.anchorId,
        generation: tuple.generation,
        contextEpoch: tuple.contextEpoch,
        semanticIdentity: tuple.semanticIdentity,
        bindingEpoch: tuple.bindingEpoch
      });
      const operation = {
        state: state,
        tuple: tuple,
        handle: this._acquire('pendingRenders', undefined, 'semantic anchor resolver')
      };
      this.pendingOperations.add(operation);

      let result;
      try {
        result = this.resolveCandidates(state.descriptor.candidateLocators, request);
      } catch (_error) {
        this._releaseOperation(operation);
        return false;
      }

      const registry = this;
      (async function () {
        try {
          const resolved = await result;
          // Resolver await boundary: generation, context, identity, and binding epoch all re-enter here.
          if (!registry._tupleIsCurrent(state, tuple)) return;
          const candidates = Array.isArray(resolved) ? resolved.slice(0, MAX_CANDIDATES) : [];
          for (const candidate of candidates) {
            const parts = registry._candidateParts(candidate);
            if (!parts || !registry._connected(parts)) continue;
            let firstProof;
            try {
              firstProof = await registry.validateCandidate(candidate, state.descriptor, request);
            } catch (_error) {
              continue;
            }
            // Validator await boundary repeats the complete registry-owned tuple.
            if (!registry._tupleIsCurrent(state, tuple)) return;
            if (!registry._proofMatches(firstProof, state.descriptor) || !registry._connected(parts)) continue;
            const firstRect = registry._safeRect(parts);
            if (!firstRect) continue;

            let finalProof;
            try {
              finalProof = await registry.validateCandidate(candidate, state.descriptor, request);
            } catch (_error) {
              continue;
            }
            // Final validator await boundary cannot inherit authority from the first proof.
            if (!registry._tupleIsCurrent(state, tuple)) return;
            if (!registry._proofMatches(finalProof, state.descriptor) || !registry._connected(parts)) continue;
            const finalRect = registry._safeRect(parts);
            if (!finalRect || !registry._tupleIsCurrent(state, tuple)) return;

            state.binding = {
              anchorId: state.descriptor.anchorId,
              candidate: candidate,
              boundIdentity: state.descriptor.semanticIdentity,
              contextEpoch: tuple.contextEpoch,
              bindingEpoch: tuple.bindingEpoch,
              geometryCertificate: finalRect
            };
            if (!registry._commitProjection(state, finalRect)) state.binding = null;
            return;
          }
        } catch (_error) {
          // Resolver rejection is an absence result; it does not regain authority.
        } finally {
          registry._releaseOperation(operation);
        }
      })();
      return true;
    }

    _cancelFrame() {
      if (!this.frameHandle) return false;
      const handle = this.frameHandle;
      this.frameHandle = null;
      this.frameId = null;
      this.pendingSignals.clear();
      return this._release(handle, true);
    }

    _scheduleFrame(kind) {
      this.pendingSignals.add(kind);
      if (this.frameHandle || this.disposed || this.abortSignal.aborted) return true;
      const registry = this;
      const frameId = this.window.requestAnimationFrame(function () {
        const handle = registry.frameHandle;
        registry.frameHandle = null;
        registry.frameId = null;
        registry.pendingSignals.clear();
        if (handle) registry._release(handle, false);
        if (registry.disposed || registry.abortSignal.aborted) return;
        for (const state of registry.states.values()) {
          if (state.descriptor.contextEpoch !== registry.contextEpoch) continue;
          if (state.binding && registry._commitExisting(state)) continue;
          registry._resolveState(state);
        }
      });
      this.frameId = frameId;
      this.frameHandle = this._acquire('animationFrames', function () {
        registry.window.cancelAnimationFrame(frameId);
      }, 'coalesced semantic anchor validation frame');
      return true;
    }

    setContext(context) {
      if (this.disposed || !isRecord(context)) return false;
      const keys = Object.keys(context).sort();
      if (keys.length !== 2 || keys[0] !== 'contextEpoch' || keys[1] !== 'generation' ||
          !isPositiveSafeInteger(context.generation) || !isPositiveSafeInteger(context.contextEpoch)) {
        return false;
      }
      if (context.generation < this.generation ||
          (context.generation === this.generation && this.contextEpoch !== null && context.contextEpoch < this.contextEpoch)) {
        return false;
      }
      if (context.generation === this.generation && context.contextEpoch === this.contextEpoch) return true;
      this._cancelFrame();
      for (const state of this.states.values()) {
        this._withdrawState(state, BINDING_REASON.CONTEXT_CHANGED, false);
      }
      this.generation = context.generation;
      this.contextEpoch = context.contextEpoch;
      return true;
    }

    register(input) {
      if (this.disposed) return null;
      const normalized = normalizeDescriptor(input);
      if (this.contextEpoch !== null && normalized.contextEpoch !== this.contextEpoch) {
        throw new TypeError('descriptor contextEpoch must match the registry context');
      }
      const previous = this.states.get(normalized.anchorId);
      const state = previous || {
        descriptor: normalized,
        binding: null,
        bindingEpoch: 0
      };
      if (previous) this._withdrawState(previous, BINDING_REASON.REBIND, false);
      state.descriptor = normalized;
      state.binding = null;
      this.states.set(normalized.anchorId, state);
      return normalized;
    }

    resolve(anchorId) {
      if (this.disposed || typeof anchorId !== 'string') return false;
      const state = this.states.get(anchorId);
      return state ? this._resolveState(state) : false;
    }

    signal(kind) {
      if (this.disposed || this.abortSignal.aborted || !SIGNAL_VALUES.has(kind)) return false;
      for (const state of this.states.values()) {
        if (!state.binding) continue;
        if (kind === 'navigation') {
          this._withdrawState(state, BINDING_REASON.NAVIGATION, false);
          continue;
        }
        const validation = this._validateSync(state, state.binding.candidate);
        if (!validation.ok) this._withdrawState(state, validation.reason, false);
      }
      return this._scheduleFrame(kind);
    }

    withdraw(anchorId, reason) {
      if (this.disposed || typeof anchorId !== 'string') return false;
      const state = this.states.get(anchorId);
      if (!state) return false;
      const value = Object.values(BINDING_REASON).includes(reason) ? reason : BINDING_REASON.MANUAL;
      this._withdrawState(state, value, false);
      return true;
    }

    getSnapshot() {
      const anchors = [];
      for (const state of this.states.values()) {
        anchors.push(Object.freeze({
          anchorId: state.descriptor.anchorId,
          semanticIdentity: state.descriptor.semanticIdentity,
          contextEpoch: state.descriptor.contextEpoch,
          bindingEpoch: state.bindingEpoch,
          bound: !!state.binding
        }));
      }
      return Object.freeze({
        generation: this.generation,
        contextEpoch: this.contextEpoch,
        disposed: this.disposed,
        anchors: Object.freeze(anchors),
        resources: this.ledger.snapshot()
      });
    }

    dispose() {
      if (this.disposed) return this.ledger.snapshot();
      this.disposed = true;
      this.pendingSignals.clear();
      this._cancelFrame();

      for (const state of this.states.values()) {
        state.binding = null;
        this._advanceEpoch(state);
      }
      for (const operation of Array.from(this.pendingOperations)) {
        this._releaseOperation(operation);
      }
      const handles = this.ownedHandles.slice().reverse();
      for (const handle of handles) this._release(handle, true);
      this.observer = null;
      this.observerHandle = null;
      this.frameId = null;
      this.frameHandle = null;
      return this.ledger.snapshot();
    }
  }

  function createRegistry(options) {
    return new AnchorRegistry(options);
  }

  const api = Object.freeze({
    IDENTITY_KIND: IDENTITY_KIND,
    LOCATOR_KIND: LOCATOR_KIND,
    BINDING_REASON: BINDING_REASON,
    normalizeDescriptor: normalizeDescriptor,
    createRegistry: createRegistry
  });

  globalThis.FSBSkopeoAnchorRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
