// Explicit-only Skopeo document runtime.
// This classic script owns one generation adapter and creates no DOM on load.
(function () {
  'use strict';

  const STALE_CODE = 'SKOPEO_STALE_GENERATION';
  const DOUBLE_ESCAPE_MS = 600;
  const MAX_ROUTE_URL_LENGTH = 4096;
  const MAX_ACTION_TOKEN_LENGTH = 160;
  const ACTIVE_ATTENTION = Object.freeze(['ambient', 'anchored', 'focused', 'interstitial']);
  const READY_ATTENTION = new Set(['ambient', 'anchored']);
  const RESOURCE_CATEGORIES = Object.freeze([
    'roots',
    'listeners',
    'observers',
    'timeouts',
    'intervals',
    'animationFrames',
    'animations',
    'focusHooks',
    'pointerSurfaces',
    'pendingRenders',
    'popoverTopLayer'
  ]);
  const RESOURCE_CATEGORY_SET = new Set(RESOURCE_CATEGORIES);

  function isPositiveGeneration(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  function isExactEnvelope(envelope, action) {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
    if (envelope.action !== action || !isPositiveGeneration(envelope.generation)) return false;

    const expectedKeys = action === 'skopeo:terminate'
      ? ['action', 'generation', 'reason']
      : ['action', 'generation'];
    const actualKeys = Object.keys(envelope).sort();
    if (actualKeys.length !== expectedKeys.length) return false;
    if (actualKeys.some(function (key, index) { return key !== expectedKeys[index]; })) return false;
    return action !== 'skopeo:terminate' ||
      (typeof envelope.reason === 'string' && envelope.reason.trim().length > 0);
  }

  function hasExactOwnKeys(value, expectedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actualKeys = Reflect.ownKeys(value);
    if (actualKeys.length !== expectedKeys.length || actualKeys.some(function (key) {
      return typeof key !== 'string';
    })) return false;
    const actual = actualKeys.slice().sort();
    const expected = expectedKeys.slice().sort();
    return actual.every(function (key, index) { return key === expected[index]; });
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function boundedText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function identifier(value) {
    return boundedText(value, 128) && /^[a-z0-9][A-Za-z0-9._-]*$/.test(value);
  }

  function validSemanticEntity(value) {
    return value === null || (hasExactOwnKeys(value, ['kind', 'id', 'label']) &&
      identifier(value.kind) && boundedText(value.id, 512) && boundedText(value.label, 80));
  }

  function copySemanticEntity(value) {
    return value === null ? null : deepFreeze({ kind: value.kind, id: value.id, label: value.label });
  }

  function sameEntity(left, right) {
    if (left === null || right === null) return left === right;
    return !!left && !!right && left.kind === right.kind && left.id === right.id && left.label === right.label;
  }

  function validProjection(value, generation) {
    const projector = window.FsbSkopeoCapabilityProjector;
    if (!projector || typeof projector.validateProjection !== 'function' ||
        !isPositiveGeneration(generation) || !value || value.generation !== generation) return false;
    try {
      return projector.validateProjection(value) === true &&
        new URL(window.location.href).origin === value.exactOrigin;
    } catch (_error) {
      return false;
    }
  }

  function cloneProjection(value) {
    try {
      return deepFreeze(JSON.parse(JSON.stringify(value)));
    } catch (_error) {
      return null;
    }
  }

  function isExactConfigure(envelope) {
    return hasExactOwnKeys(envelope, ['action', 'generation', 'projection']) &&
      envelope.action === 'skopeo:configure' && isPositiveGeneration(envelope.generation) &&
      validProjection(envelope.projection, envelope.generation);
  }

  function isExactRouteChange(envelope) {
    return hasExactOwnKeys(envelope, ['action', 'generation', 'url']) &&
      envelope.action === 'skopeo:route-change' &&
      isPositiveGeneration(envelope.generation) &&
      typeof envelope.url === 'string' && envelope.url.length > 0 &&
      envelope.url.length <= MAX_ROUTE_URL_LENGTH;
  }

  function sameSemanticIdentity(left, right) {
    return !!left && !!right && left.kind === right.kind && left.id === right.id;
  }

  function zeroResources() {
    const resources = {};
    RESOURCE_CATEGORIES.forEach(function (category) { resources[category] = 0; });
    return resources;
  }

  function resourcesAreExactZero(resources) {
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return false;
    const keys = Object.keys(resources);
    if (keys.length !== RESOURCE_CATEGORIES.length || keys.some(function (key) {
      return !RESOURCE_CATEGORY_SET.has(key);
    })) return false;
    return RESOURCE_CATEGORIES.every(function (category) {
      return Object.prototype.hasOwnProperty.call(resources, category) &&
        typeof resources[category] === 'number' &&
        Number.isFinite(resources[category]) &&
        resources[category] === 0;
    });
  }

  function installOwner() {
    const state = {
      generation: 0,
      phase: 'idle',
      terminal: false,
      disposed: false,
      mounted: false,
      attention: 'ambient',
      controller: null,
      shell: null,
      router: null,
      registry: null,
      routeResult: null,
      contextEpoch: 0,
      semanticIdentity: null,
      anchorAdapter: null,
      activeAnchorId: null,
      bindingEpoch: 0,
      preparedPlacement: null,
      fixtureToken: null,
      fixtureTimerId: null,
      fixtureActivated: false,
      lastEscapeAt: null,
      teardownReason: null,
      teardownOrder: [],
      finalSnapshot: null,
      runtimeListenerInstalled: false,
      activeListenersInstalled: false,
      configured: false,
      projection: null,
      contextResolver: null,
      appContext: null,
      adaptiveModel: null,
      selectedGroupId: null,
      selectedActionSlug: null,
      adaptiveResult: null,
      renderedAtoms: Object.freeze([]),
      actionEpoch: 0,
      pendingActionToken: null,
      pendingConsequence: null,
      pendingConsequenceAction: null,
      collectionEpoch: 0,
      pendingArgumentCollection: null,
      corpusActionEpoch: 0,
      corpusModelToken: null,
      pendingCorpusToken: null,
      consumedCorpusToken: null,
      contractActionEpoch: 0,
      pendingContractToken: null,
      contractSemanticEntityToken: null,
      contractRequestActionToken: null,
      contractViewToken: null,
      contractActionIds: Object.freeze([]),
      pendingContractActions: new Set(),
      consumedContractActions: new Set(),
      contractAskState: 'idle',
      contractAskEpoch: 0,
      contractAskScope: null,
      contractAskQuestion: null,
      contractAskConfirmation: null
    };
    const api = {};
    const runtimeResources = zeroResources();
    const runtimeLedgerHandles = new Map();
    let nextRuntimeLedgerHandleId = 1;

    function bumpRuntimeResource(category, delta) {
      const next = runtimeResources[category] + delta;
      if (!RESOURCE_CATEGORY_SET.has(category) || !Number.isSafeInteger(next) || next < 0) {
        throw new Error('Invalid Skopeo runtime resource transition: ' + category);
      }
      runtimeResources[category] = next;
    }

    const runtimeResourceLedger = Object.freeze({
      acquire: function (category, cleanup, detail) {
        if (!RESOURCE_CATEGORY_SET.has(category)) throw new TypeError('Unknown Skopeo runtime resource category');
        const handle = Object.freeze({
          id: nextRuntimeLedgerHandleId++,
          category: category,
          detail: typeof detail === 'string' ? detail : ''
        });
        runtimeLedgerHandles.set(handle, {
          cleanup: typeof cleanup === 'function' ? cleanup : null,
          released: false
        });
        bumpRuntimeResource(category, 1);
        return handle;
      },
      release: function (handle, options) {
        const entry = runtimeLedgerHandles.get(handle);
        if (!entry) throw new TypeError('Unknown Skopeo runtime resource handle');
        if (entry.released) throw new Error('Skopeo runtime resource already released');
        entry.released = true;
        if ((!options || options.cleanup !== false) && entry.cleanup) {
          try {
            entry.cleanup();
          } catch (error) {
            if (!options || options.suppressCleanupError !== true) throw error;
          }
        }
        bumpRuntimeResource(handle.category, -1);
        return true;
      },
      snapshot: function () {
        return Object.freeze(Object.assign({}, runtimeResources));
      }
    });

    function combinedResourceSnapshot(shellResources) {
      const shell = shellResources && typeof shellResources === 'object' && !Array.isArray(shellResources)
        ? shellResources
        : null;
      const combined = {};
      RESOURCE_CATEGORIES.forEach(function (category) {
        const shellValue = shell && Object.prototype.hasOwnProperty.call(shell, category) &&
          typeof shell[category] === 'number' && Number.isFinite(shell[category])
          ? shell[category]
          : NaN;
        combined[category] = shellValue + runtimeResources[category];
      });
      if (shell) {
        Object.keys(shell).forEach(function (key) {
          if (!RESOURCE_CATEGORY_SET.has(key)) combined[key] = shell[key];
        });
      }
      return combined;
    }

    function shellResourceSnapshot() {
      if (!state.shell || typeof state.shell.getResourceSnapshot !== 'function') return zeroResources();
      try {
        return state.shell.getResourceSnapshot();
      } catch (_error) {
        return {};
      }
    }

    function isLive(generation) {
      return !state.disposed && !state.terminal && state.generation === generation &&
        state.controller && !state.controller.signal.aborted;
    }

    function routeProjection(result) {
      if (!result || typeof result !== 'object' || !isPositiveGeneration(result.contextEpoch)) return null;
      if (result.status === 'recognized' && typeof result.contextKind === 'string') {
        return {
          status: 'recognized',
          contextKind: result.contextKind,
          contextEpoch: result.contextEpoch
        };
      }
      if ((result.status === 'uncertain' || result.status === 'unsupported') &&
          typeof result.reason === 'string') {
        return {
          status: result.status,
          contextEpoch: result.contextEpoch,
          reason: result.reason
        };
      }
      return null;
    }

    function authorityTupleIsCurrent(tuple) {
      return !!tuple && isLive(state.generation) && state.phase === 'active' && state.mounted &&
        tuple.generation === state.generation && tuple.contextEpoch === state.contextEpoch &&
        isPositiveGeneration(tuple.bindingEpoch) &&
        sameSemanticIdentity(tuple.semanticIdentity, state.semanticIdentity) &&
        state.routeResult && state.routeResult.status === 'recognized';
    }

    function registryBindingTupleIsCurrent(tuple, expectedBound) {
      if (!authorityTupleIsCurrent(tuple) || !state.registry || !state.activeAnchorId ||
          typeof state.registry.getSnapshot !== 'function') return false;
      let snapshot;
      try {
        snapshot = state.registry.getSnapshot();
      } catch (_error) {
        return false;
      }
      const anchors = snapshot && Array.isArray(snapshot.anchors) ? snapshot.anchors : [];
      const anchor = anchors.find(function (candidate) {
        return candidate && candidate.anchorId === state.activeAnchorId;
      });
      return !!anchor && anchor.contextEpoch === tuple.contextEpoch &&
        anchor.bindingEpoch === tuple.bindingEpoch && anchor.bound === expectedBound &&
        sameSemanticIdentity(anchor.semanticIdentity, tuple.semanticIdentity);
    }

    function onRegistryWithdraw(notice) {
      if (!notice || !isLive(state.generation) || state.phase !== 'active' || !state.mounted ||
          !state.routeResult || state.routeResult.status !== 'recognized' ||
          notice.anchorId !== state.activeAnchorId || !isPositiveGeneration(notice.bindingEpoch) ||
          notice.bindingEpoch <= state.bindingEpoch || typeof notice.reason !== 'string') {
        return false;
      }
      const tuple = {
        generation: state.generation,
        contextEpoch: state.contextEpoch,
        semanticIdentity: state.semanticIdentity,
        bindingEpoch: notice.bindingEpoch
      };
      if (!registryBindingTupleIsCurrent(tuple, false)) return false;
      state.bindingEpoch = notice.bindingEpoch;
      if (!state.shell || typeof state.shell.withdrawSemanticAnchor !== 'function') return false;
      return state.shell.withdrawSemanticAnchor({
        contextEpoch: state.contextEpoch,
        bindingEpoch: notice.bindingEpoch,
        reason: notice.reason
      }) === true;
    }

    function onRegistryCommit(projection) {
      if (!hasExactOwnKeys(projection, [
        'generation',
        'contextEpoch',
        'semanticIdentity',
        'bindingEpoch',
        'targetRect'
      ]) || !registryBindingTupleIsCurrent(projection, true) || projection.bindingEpoch < state.bindingEpoch ||
          !state.activeAnchorId || !state.shell ||
          typeof state.shell.commitSemanticAnchor !== 'function') {
        return false;
      }
      // The full generation/context/identity/binding tuple is repeated at the
      // final visual side effect, after the registry's own await boundaries.
      if (!registryBindingTupleIsCurrent(projection, true)) return false;
      const committed = state.shell.commitSemanticAnchor(projection) === true;
      state.bindingEpoch = Math.max(state.bindingEpoch, projection.bindingEpoch);
      return committed;
    }

    function withdrawCurrentProjection(reason) {
      if (!state.routeResult || state.routeResult.status !== 'recognized') {
        state.activeAnchorId = null;
        state.bindingEpoch = 0;
        return false;
      }
      const contextEpoch = state.contextEpoch;
      const previousBindingEpoch = state.bindingEpoch;
      const anchorId = state.activeAnchorId;
      if (state.registry && anchorId && typeof state.registry.withdraw === 'function') {
        try {
          state.registry.withdraw(anchorId, reason);
        } catch (_error) {
          // The fallback shell withdrawal below still removes visible authority.
        }
      }
      if (state.bindingEpoch === previousBindingEpoch && state.shell &&
          typeof state.shell.withdrawSemanticAnchor === 'function') {
        const nextBindingEpoch = Math.max(previousBindingEpoch + 1, 1);
        try {
          state.shell.withdrawSemanticAnchor({
            contextEpoch: contextEpoch,
            bindingEpoch: nextBindingEpoch,
            reason: reason
          });
        } catch (_error) {
          // Route authority is still revoked before the next admission.
        }
        state.bindingEpoch = nextBindingEpoch;
      }
      state.activeAnchorId = null;
      return true;
    }

    function routeContextInternal(input, withdrawalReason) {
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted ||
          !state.router || typeof state.router.route !== 'function' || !state.shell ||
          typeof state.shell.projectContext !== 'function') {
        return false;
      }

      withdrawCurrentProjection(withdrawalReason || 'context-changed');
      let result;
      try {
        result = state.router.route(input);
      } catch (_error) {
        return false;
      }
      const projection = routeProjection(result);
      if (!projection || result.contextEpoch <= state.contextEpoch || !isLive(state.generation)) return false;

      state.routeResult = result;
      state.contextEpoch = result.contextEpoch;
      state.semanticIdentity = result.status === 'recognized' ? result.semanticIdentity : null;
      state.activeAnchorId = null;
      state.bindingEpoch = 0;

      if (state.registry && typeof state.registry.setContext === 'function') {
        try {
          state.registry.setContext({ generation: state.generation, contextEpoch: state.contextEpoch });
        } catch (_error) {
          return false;
        }
      }
      if (!isLive(state.generation)) return false;
      return state.shell.projectContext(projection) === true ? result : false;
    }

    function untrustedRouteInput(rawUrl) {
      let contextKind = 'focused-ask';
      try {
        const parsed = new URL(rawUrl);
        if (parsed.origin === 'https://docs.google.com') contextKind = 'agreement-reading';
        else if (parsed.origin === 'https://drive.google.com') contextKind = 'vendor-folder';
      } catch (_error) {
        // The router returns the closed route-malformed failure.
      }
      return {
        url: rawUrl,
        contextKind: contextKind,
        semanticIdentity: null,
        evidence: []
      };
    }

    function routeUntrustedUrl(rawUrl, reason) {
      if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_ROUTE_URL_LENGTH) {
        return false;
      }
      return routeContextInternal(untrustedRouteInput(rawUrl), reason || 'navigation');
    }

    function configureAnchorAdapter(adapter) {
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted ||
          !hasExactOwnKeys(adapter, [
            'observationRoot',
            'resolveCandidates',
            'validateCandidate'
          ])) return false;
      const root = adapter.observationRoot;
      if (!root || typeof root !== 'object' || root.isConnected !== true ||
          root === document || root === document.documentElement || root === document.body ||
          typeof root.contains !== 'function' ||
          typeof adapter.resolveCandidates !== 'function' ||
          typeof adapter.validateCandidate !== 'function') {
        return false;
      }
      if (state.registry) {
        return !!state.anchorAdapter && state.anchorAdapter.observationRoot === root &&
          state.anchorAdapter.resolveCandidates === adapter.resolveCandidates &&
          state.anchorAdapter.validateCandidate === adapter.validateCandidate;
      }
      if (!window.FSBSkopeoAnchorRegistry ||
          typeof window.FSBSkopeoAnchorRegistry.createRegistry !== 'function') return false;

      const trustedAdapter = Object.freeze({
        observationRoot: root,
        resolveCandidates: adapter.resolveCandidates,
        validateCandidate: adapter.validateCandidate
      });
      let registry;
      try {
        registry = window.FSBSkopeoAnchorRegistry.createRegistry({
          generation: state.generation,
          signal: state.controller.signal,
          window: window,
          document: document,
          observationRoot: root,
          resourceLedger: runtimeResourceLedger,
          resolveCandidates: trustedAdapter.resolveCandidates,
          validateCandidate: trustedAdapter.validateCandidate,
          isCurrent: authorityTupleIsCurrent,
          onWithdraw: onRegistryWithdraw,
          onCommit: onRegistryCommit
        });
      } catch (_error) {
        return false;
      }
      state.anchorAdapter = trustedAdapter;
      state.registry = registry;
      if (state.contextEpoch > 0 && typeof registry.setContext === 'function') {
        if (registry.setContext({ generation: state.generation, contextEpoch: state.contextEpoch }) !== true) {
          registry.dispose();
          state.registry = null;
          state.anchorAdapter = null;
          return false;
        }
      }
      return true;
    }

    function bindSemanticAnchor(descriptor) {
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted ||
          !state.registry || !state.routeResult || state.routeResult.status !== 'recognized' ||
          !descriptor || typeof descriptor !== 'object' ||
          descriptor.contextEpoch !== state.contextEpoch ||
          !sameSemanticIdentity(descriptor.semanticIdentity, state.semanticIdentity)) {
        return false;
      }
      if (state.activeAnchorId && descriptor.anchorId !== state.activeAnchorId) {
        withdrawCurrentProjection('rebind');
      }
      let normalized;
      try {
        normalized = state.registry.register(descriptor);
      } catch (_error) {
        return false;
      }
      if (!normalized || typeof normalized.anchorId !== 'string' || !isLive(state.generation)) return false;
      state.activeAnchorId = normalized.anchorId;
      try {
        if (state.registry.resolve(normalized.anchorId) !== true) {
          state.activeAnchorId = null;
          return false;
        }
      } catch (_error) {
        state.activeAnchorId = null;
        return false;
      }
      return true;
    }

    function withdrawSemanticAnchor(reason) {
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted ||
          !state.registry || !state.activeAnchorId || typeof reason !== 'string') return false;
      const allowed = window.FSBSkopeoAnchorRegistry && window.FSBSkopeoAnchorRegistry.BINDING_REASON
        ? Object.values(window.FSBSkopeoAnchorRegistry.BINDING_REASON)
        : [];
      const normalizedReason = allowed.includes(reason) ? reason : 'manual';
      const anchorId = state.activeAnchorId;
      let withdrawn = false;
      try {
        withdrawn = state.registry.withdraw(anchorId, normalizedReason) === true;
      } catch (_error) {
        withdrawn = false;
      }
      state.activeAnchorId = null;
      return withdrawn;
    }

    function projectionAuthorityIsCurrent() {
      return !!state.configured && !!state.projection && isLive(state.generation) &&
        state.projection.generation === state.generation;
    }

    function currentAdaptiveEntity() {
      return state.appContext && validSemanticEntity(state.appContext.semanticEntity)
        ? copySemanticEntity(state.appContext.semanticEntity)
        : null;
    }

    function currentAdaptiveTuple() {
      if (!projectionAuthorityIsCurrent() || !state.appContext ||
          !isPositiveGeneration(state.appContext.contextEpoch)) return null;
      return deepFreeze({
        generation: state.generation,
        exactOrigin: state.projection.exactOrigin,
        profileId: state.projection.profileId,
        profileVersion: state.projection.profileVersion,
        catalogVersion: state.projection.catalogVersion,
        contextEpoch: state.appContext.contextEpoch,
        semanticEntity: currentAdaptiveEntity()
      });
    }

    function sameAdaptiveTuple(left, right) {
      return !!left && !!right && left.generation === right.generation &&
        left.exactOrigin === right.exactOrigin && left.profileId === right.profileId &&
        left.profileVersion === right.profileVersion && left.catalogVersion === right.catalogVersion &&
        left.contextEpoch === right.contextEpoch && sameEntity(left.semanticEntity, right.semanticEntity);
    }

    function currentCorpusTuple() {
      const tuple = currentAdaptiveTuple();
      const entity = tuple && tuple.semanticEntity;
      const profile = state.projection && state.projection.profile;
      if (!tuple || !entity || !profile || profile.adapterId !== 'drive-docs-deep-pack-v1') return null;
      if (entity.kind === 'docs-document') {
        return tuple.exactOrigin === 'https://docs.google.com' ? tuple : null;
      }
      if (entity.kind === 'drive-folder' || entity.kind === 'drive-file') {
        return tuple.exactOrigin === 'https://drive.google.com' ? tuple : null;
      }
      return null;
    }

    function semanticEntityToken(entity) {
      return entity && validSemanticEntity(entity) ? entity.kind + ':' + entity.id : null;
    }

    function corpusAuthority(tuple) {
      return deepFreeze({
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileId: tuple.profileId,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch
      });
    }

    function nextCorpusActionToken() {
      state.corpusActionEpoch += 1;
      return 'sc1_' + String(state.generation) + '_' + String(state.contextEpoch) + '_' +
        String(state.corpusActionEpoch) + '_' + String(Date.now()).slice(-12);
    }

    function withdrawCorpusProjection() {
      state.corpusActionEpoch += 1;
      state.corpusModelToken = null;
      state.pendingCorpusToken = null;
      state.consumedCorpusToken = null;
      const contractOwnsRegion = state.pendingContractToken !== null ||
        state.contractViewToken !== null;
      if (!contractOwnsRegion && state.shell && typeof state.shell.withdrawCorpus === 'function') {
        try { state.shell.withdrawCorpus(); } catch (_error) {}
      }
      return true;
    }

    function sameCurrentCorpusTuple(tuple) {
      return sameAdaptiveTuple(tuple, currentCorpusTuple());
    }

    /* FSB_SKOPEO_CONTRACT_RUNTIME_START */
    function contractRevokeClaim(projectionToken, entityToken, tuple) {
      if (!tuple || !boundedText(projectionToken, 192) || !boundedText(entityToken, 192)) return null;
      return {
        action: 'skopeo:hud-revoke',
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: entityToken,
        projectionToken: projectionToken
      };
    }

    function removeContractSurface(owned) {
      if (!state.shell) return true;
      let withdrawn = false;
      if (typeof state.shell.withdrawCorpus === 'function') {
        try { withdrawn = state.shell.withdrawCorpus() === true; } catch (_error) { withdrawn = false; }
      }
      if (withdrawn === true) return true;
      if (owned !== true) return true;
      if (typeof state.shell.destroy === 'function') {
        try { state.shell.destroy(); } catch (_error) {}
      }
      return false;
    }

    function withdrawContractProjection() {
      const owned = state.pendingContractToken !== null || state.contractViewToken !== null ||
        state.contractAskState !== 'idle';
      cancelContractAskBestEffort();
      const revokeClaim = contractRevokeClaim(
        state.contractViewToken,
        state.contractSemanticEntityToken,
        contractAdmissionTuple()
      );
      state.contractActionEpoch += 1;
      state.pendingContractToken = null;
      state.contractSemanticEntityToken = null;
      state.contractRequestActionToken = null;
      state.contractViewToken = null;
      state.contractActionIds = Object.freeze([]);
      state.pendingContractActions.clear();
      state.consumedContractActions.clear();
      state.contractAskEpoch += 1;
      state.contractAskState = 'idle';
      state.contractAskScope = null;
      state.contractAskQuestion = null;
      state.contractAskConfirmation = null;
      const removed = removeContractSurface(owned);
      if (revokeClaim) sendOutbound(revokeClaim);
      return removed;
    }

    function onContractWithdraw(_reason) {
      return withdrawContractProjection() === true;
    }

    function contractAdmissionTuple() {
      const tuple = currentCorpusTuple();
      const entity = tuple && tuple.semanticEntity;
      if (!tuple || !entity || !state.routeResult || state.routeResult.status !== 'recognized' ||
          !state.appContext || state.appContext.status !== 'recognized' ||
          !sameSemanticIdentity(state.routeResult.semanticIdentity, entity) ||
          !['drive-folder', 'drive-file', 'docs-document'].includes(entity.kind)) return null;
      if (entity.kind === 'docs-document' && tuple.exactOrigin !== 'https://docs.google.com') return null;
      if (entity.kind !== 'docs-document' && tuple.exactOrigin !== 'https://drive.google.com') return null;
      return tuple;
    }

    function sameCurrentContractTuple(tuple) {
      return sameAdaptiveTuple(tuple, contractAdmissionTuple());
    }

    function nextContractSemanticEntityToken(tuple) {
      return 'se1_' + String(tuple.generation) + '_' + String(tuple.contextEpoch) + '_' +
        String(state.contractActionEpoch) + '_' + String(Date.now()).slice(-12);
    }

    function contractClaim(tuple, entityToken, actionToken) {
      if (!tuple || !boundedText(entityToken, 192) ||
          !boundedText(actionToken, MAX_ACTION_TOKEN_LENGTH)) return null;
      return {
        action: 'skopeo:hud-projection',
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: entityToken,
        actionToken: actionToken
      };
    }

    function contractAskClaim(action, tuple, entityToken, projectionToken, extra) {
      if (!tuple || !boundedText(entityToken, 192) || !boundedText(projectionToken, 192) ||
          !['skopeo:hud-ask', 'skopeo:hud-ask-cancel', 'skopeo:hud-answer-action',
            'skopeo:hud-answer-action-confirm', 'skopeo:hud-alert-action',
            'skopeo:hud-alert-action-confirm'].includes(action)) return null;
      const output = {
        action: action,
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: entityToken,
        projectionToken: projectionToken
      };
      if (action === 'skopeo:hud-ask') {
        if (!extra || !boundedText(extra.scopeToken, 192) || !safeContractQuestion(extra.question)) return null;
        output.scopeToken = extra.scopeToken;
        output.question = { text: extra.question };
      } else if (action === 'skopeo:hud-answer-action' || action === 'skopeo:hud-alert-action') {
        if (!extra || !boundedText(extra.actionId, 192)) return null;
        output.actionId = extra.actionId;
      } else if (action === 'skopeo:hud-answer-action-confirm' ||
          action === 'skopeo:hud-alert-action-confirm') {
        if (!extra || !boundedText(extra.actionId, 192) ||
            !boundedText(extra.confirmationToken, 192)) return null;
        output.actionId = extra.actionId;
        output.confirmationToken = extra.confirmationToken;
      }
      return output;
    }

    function safeContractQuestion(value) {
      if (typeof value !== 'string') return false;
      const question = value.trim();
      if (question !== value || question.length === 0 ||
          /[\u0000-\u001f\u007f\u0080-\u009f\u202a-\u202e\u2066-\u2069<>]/.test(question)) {
        return false;
      }
      let scalars = 0;
      for (let index = 0; index < question.length; index += 1) {
        const unit = question.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          if (index + 1 >= question.length) return false;
          const next = question.charCodeAt(index + 1);
          if (next < 0xdc00 || next > 0xdfff) return false;
          index += 1;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
        scalars += 1;
        if (scalars > 2000) return false;
      }
      return scalars > 0;
    }

    function currentContractAskAuthority(
      tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
    ) {
      return isLive(tuple.generation) && state.phase === 'active' && state.mounted &&
        sameCurrentContractTuple(tuple) && state.contractActionEpoch === contractEpoch &&
        state.contractAskEpoch === askEpoch && state.contractSemanticEntityToken === entityToken &&
        state.contractRequestActionToken === requestActionToken &&
        state.contractViewToken === projectionToken && state.pendingContractToken === null &&
        documentIsVisible();
    }

    function localAskProjection(tuple, entityToken, requestActionToken, projectionToken, scope, askState,
      question, error) {
      if (!tuple || !scope || !['editing', 'checking', 'error'].includes(askState)) return null;
      return {
        version: 'skopeo-hud-projection/1',
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: entityToken,
        requestActionToken: requestActionToken,
        projectionToken: projectionToken,
        mode: 'ask',
        currentness: 'current',
        result: 'complete',
        body: {
          scope: { kind: scope.kind, label: scope.label, scopeToken: scope.scopeToken },
          question: question,
          state: askState,
          error: error
        }
      };
    }

    function contractAskModelForProjection(projection) {
      const composer = window.FSBSkopeoAdaptiveComposer;
      if (!composer || typeof composer.composeContractAsk !== 'function' ||
          typeof composer.validateContractAskModel !== 'function') return null;
      try {
        const model = composer.composeContractAsk(projection);
        return model && composer.validateContractAskModel(model) === true ? model : null;
      } catch (_error) {
        return null;
      }
    }

    function renderContractAskModel(model, callback) {
      return !!state.shell && typeof state.shell.renderContractAsk === 'function' &&
        state.shell.renderContractAsk(model, callback) === true;
    }

    function renderLocalContractAsk(
      tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch,
      askState, question, error
    ) {
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || !state.contractAskScope) return false;
      const projection = localAskProjection(
        tuple, entityToken, requestActionToken, projectionToken, state.contractAskScope,
        askState, question, error
      );
      const model = projection && contractAskModelForProjection(projection);
      if (!model) return false;
      const callback = function(payload) {
        return routeContractAskAction(
          payload, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch, model
        );
      };
      if (!renderContractAskModel(model, callback) || !currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      )) return false;
      state.contractAskState = askState;
      state.contractAskQuestion = question;
      return true;
    }

    function cancelContractAskBestEffort() {
      if (state.contractAskState !== 'checking') return false;
      const tuple = contractAdmissionTuple();
      const request = contractAskClaim(
        'skopeo:hud-ask-cancel', tuple, state.contractSemanticEntityToken,
        state.contractViewToken, null
      );
      return request ? sendOutbound(request) : false;
    }

    function exactContractAuthority(projection, request) {
      return isPlainObject(projection) && projection.version === 'skopeo-hud-projection/1' &&
        projection.generation === request.generation && projection.exactOrigin === request.exactOrigin &&
        projection.profileVersion === request.profileVersion &&
        projection.contextEpoch === request.contextEpoch &&
        projection.semanticEntityToken === request.semanticEntityToken &&
        projection.requestActionToken === request.actionToken &&
        boundedText(projection.projectionToken, 192) &&
        ['folder', 'reading', 'contract-closed'].includes(projection.mode) &&
        ['current', 'partial', 'closed'].includes(projection.currentness) &&
        ['complete', 'empty', 'partial', 'not-evaluated', 'closed'].includes(projection.result);
    }

    function contractModelForProjection(projection) {
      const composer = window.FSBSkopeoAdaptiveComposer;
      if (!composer || typeof composer.composeContractView !== 'function' ||
          typeof composer.validateContractViewModel !== 'function') return null;
      try {
        const model = composer.composeContractView(projection);
        return model && composer.validateContractViewModel(model) === true ? model : null;
      } catch (_error) {
        return null;
      }
    }

    function documentIsVisible() {
      return !document || typeof document.visibilityState !== 'string' ||
        document.visibilityState === 'visible';
    }

    function contractRenderStillCurrent(tuple, entityToken, actionToken, projectionToken, epoch) {
      return isLive(tuple.generation) && state.phase === 'active' && state.mounted &&
        sameCurrentContractTuple(tuple) && state.pendingContractToken === actionToken &&
        state.contractSemanticEntityToken === entityToken &&
        state.contractActionEpoch === epoch && state.contractViewToken === projectionToken &&
        documentIsVisible() && state.shell && typeof state.shell.renderContractView === 'function';
    }

    async function requestContractProjection(tuple, entityToken, actionToken, epoch) {
      const request = contractClaim(tuple, entityToken, actionToken);
      if (!request || state.pendingContractToken !== actionToken ||
          state.contractSemanticEntityToken !== entityToken ||
          state.contractActionEpoch !== epoch || !sameCurrentContractTuple(tuple)) return false;
      let response;
      try { response = await chrome.runtime.sendMessage(request); } catch (_error) { response = null; }
      if (response) {
        try { response = JSON.parse(JSON.stringify(response)); } catch (_error) { response = null; }
      }
      if (!isLive(tuple.generation) || state.pendingContractToken !== actionToken ||
          state.contractSemanticEntityToken !== entityToken ||
          state.contractActionEpoch !== epoch || !sameCurrentContractTuple(tuple)) {
        const staleClaim = exactContractAuthority(response, request)
          ? contractRevokeClaim(response.projectionToken, entityToken, tuple)
          : null;
        if (staleClaim) sendOutbound(staleClaim);
        return false;
      }
      if (!exactContractAuthority(response, request)) {
        withdrawContractProjection();
        return false;
      }
      const admittedClosed = response.mode === 'contract-closed' ||
        response.currentness !== 'current' ||
        !['complete', 'empty'].includes(response.result);
      if (admittedClosed) withdrawContractProjection();
      const renderEpoch = state.contractActionEpoch;
      state.pendingContractToken = actionToken;
      state.contractSemanticEntityToken = entityToken;
      state.contractViewToken = response.projectionToken;
      const model = contractModelForProjection(response);
      if (!model || model.mode !== (admittedClosed ? 'contract-closed' : response.mode) ||
          !contractRenderStillCurrent(
            tuple, entityToken, actionToken, response.projectionToken, renderEpoch
          )) {
        if (state.pendingContractToken === actionToken) withdrawContractProjection();
        return false;
      }
      const actionIds = Object.freeze(model.actionIds.slice());
      const actionCallback = function(payload) {
        if (payload && typeof payload === 'object') {
          return routeContractViewAction(
            payload, tuple, entityToken, actionToken, response.projectionToken,
            renderEpoch, model
          );
        }
        const actionId = payload;
        const canDispatch = currentContractAction(
          tuple, entityToken, actionToken, response.projectionToken, renderEpoch, actionId
        ) && !state.pendingContractActions.has(actionId);
        return Promise.resolve(openContractCitation(
          actionId, tuple, entityToken, actionToken, response.projectionToken, renderEpoch
        )).then(function(opened) {
          if (canDispatch && opened !== true && isLive(tuple.generation) &&
              state.phase === 'active' && state.mounted) {
            refreshContractForCurrentContext();
          }
          return opened;
        });
      };
      if (!contractRenderStillCurrent(
        tuple, entityToken, actionToken, response.projectionToken, renderEpoch
      ) ||
          state.shell.renderContractView(model, actionCallback) !== true ||
          !contractRenderStillCurrent(
            tuple, entityToken, actionToken, response.projectionToken, renderEpoch
          )) {
        if (state.pendingContractToken === actionToken) withdrawContractProjection();
        return false;
      }
      state.pendingContractToken = null;
      state.contractRequestActionToken = actionToken;
      state.contractViewToken = response.projectionToken;
      state.contractActionIds = actionIds;
      state.contractAskState = 'idle';
      state.contractAskScope = null;
      state.contractAskQuestion = null;
      state.contractAskConfirmation = null;
      return true;
    }

    function refreshContractForCurrentContext() {
      withdrawContractProjection();
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted || !state.shell) return false;
      const composer = window.FSBSkopeoAdaptiveComposer;
      if (!composer || typeof composer.composeContractView !== 'function' ||
          typeof composer.validateContractViewModel !== 'function' ||
          typeof state.shell.renderContractView !== 'function') return false;
      const tuple = contractAdmissionTuple();
      if (!tuple) return false;
      const actionToken = nextCorpusActionToken();
      const entityToken = nextContractSemanticEntityToken(tuple);
      const epoch = state.contractActionEpoch;
      state.pendingContractToken = actionToken;
      state.contractSemanticEntityToken = entityToken;
      Promise.resolve(requestContractProjection(
        tuple, entityToken, actionToken, epoch
      )).catch(function() {});
      return true;
    }

    function currentContractAction(
      tuple, entityToken, requestActionToken, projectionToken, epoch, actionId
    ) {
      return isLive(tuple.generation) && state.phase === 'active' && state.mounted &&
        sameCurrentContractTuple(tuple) && state.contractActionEpoch === epoch &&
        state.contractSemanticEntityToken === entityToken &&
        state.contractRequestActionToken === requestActionToken && documentIsVisible() &&
        state.contractViewToken === projectionToken && state.pendingContractToken === null &&
        contractTokenInCurrentModel(actionId) && !state.consumedContractActions.has(actionId);
    }

    function contractTokenInCurrentModel(actionId) {
      return boundedText(actionId, 192) && state.contractActionIds.includes(actionId);
    }

    async function openContractCitation(
      actionId, tuple, entityToken, requestActionToken, projectionToken, epoch
    ) {
      if (!currentContractAction(
        tuple, entityToken, requestActionToken, projectionToken, epoch, actionId
      ) ||
          state.pendingContractActions.has(actionId)) return false;
      state.pendingContractActions.add(actionId);
      const request = {
        action: 'skopeo:hud-citation-open',
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: entityToken,
        projectionToken: projectionToken,
        actionId: actionId
      };
      let response;
      try { response = await chrome.runtime.sendMessage(request); } catch (_error) { response = null; }
      const stillPending = state.pendingContractActions.has(actionId);
      const current = stillPending && requestActionToken &&
        currentContractAction(
          tuple, entityToken, requestActionToken, projectionToken, epoch, actionId
        );
      if (stillPending) state.pendingContractActions.delete(actionId);
      const opened = !!current && hasExactOwnKeys(response, ['success', 'status']) &&
        response.success === true && response.status === 'opened';
      if (opened) state.consumedContractActions.add(actionId);
      return opened;
    }

    function currentContractViewAuthority(
      tuple, entityToken, requestActionToken, projectionToken, contractEpoch
    ) {
      return isLive(tuple.generation) && state.phase === 'active' && state.mounted &&
        sameCurrentContractTuple(tuple) && state.contractActionEpoch === contractEpoch &&
        state.contractSemanticEntityToken === entityToken &&
        state.contractRequestActionToken === requestActionToken &&
        state.contractViewToken === projectionToken && state.pendingContractToken === null &&
        documentIsVisible();
    }

    function beginContractAsk(
      scope, tuple, entityToken, requestActionToken, projectionToken, contractEpoch
    ) {
      if (!scope || !currentContractViewAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch
      )) return false;
      cancelContractAskBestEffort();
      state.contractAskEpoch += 1;
      const askEpoch = state.contractAskEpoch;
      state.contractAskScope = Object.freeze({
        kind: scope.kind,
        label: scope.label,
        scopeToken: scope.scopeToken
      });
      state.contractAskQuestion = null;
      state.contractAskConfirmation = null;
      state.contractAskState = 'editing';
      state.contractActionIds = Object.freeze([]);
      state.pendingContractActions.clear();
      state.consumedContractActions.clear();
      return renderLocalContractAsk(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch,
        'editing', null, null
      );
    }

    function routeContractViewAction(
      payload, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, model
    ) {
      if (hasExactOwnKeys(payload, ['kind', 'scopeToken']) && payload.kind === 'ask-entry' &&
          model && Array.isArray(model.askEntries)) {
        const scope = model.askEntries.find(function(entry) {
          return entry.scopeToken === payload.scopeToken;
        });
        return beginContractAsk(
          scope, tuple, entityToken, requestActionToken, projectionToken, contractEpoch
        );
      }
      if (hasExactOwnKeys(payload, ['kind', 'actionId']) && payload.kind === 'alert-action' &&
          model && Array.isArray(model.actionIds) && model.actionIds.includes(payload.actionId)) {
        return dispatchContractAlertAction(
          payload.actionId, tuple, entityToken, requestActionToken, projectionToken, contractEpoch
        );
      }
      return false;
    }

    function renderContractAskError(
      error, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch,
      question
    ) {
      state.contractAskState = 'error';
      return renderLocalContractAsk(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch,
        'error', question, error
      );
    }

    function exactContractAnswerAuthority(response, request, requestActionToken) {
      return isPlainObject(response) && response.version === 'skopeo-hud-projection/1' &&
        response.generation === request.generation && response.exactOrigin === request.exactOrigin &&
        response.profileVersion === request.profileVersion &&
        response.contextEpoch === request.contextEpoch &&
        response.semanticEntityToken === request.semanticEntityToken &&
        response.requestActionToken === requestActionToken &&
        boundedText(response.projectionToken, 192) && response.mode === 'answer' &&
        response.currentness === 'current' && response.result === 'complete';
    }

    function installContractAnswer(
      response, model, tuple, entityToken, requestActionToken, contractEpoch, askEpoch
    ) {
      if (!model || model.mode !== 'answer' || !response.body || !response.body.scope ||
          !currentContractAskAuthority(
            tuple, entityToken, requestActionToken, state.contractViewToken, contractEpoch, askEpoch
          )) return false;
      state.contractViewToken = response.projectionToken;
      state.contractAskScope = Object.freeze({
        kind: response.body.scope.kind,
        label: response.body.scope.label,
        scopeToken: response.body.scope.scopeToken
      });
      state.contractAskState = 'result';
      state.contractAskQuestion = response.body.question;
      state.contractAskConfirmation = null;
      state.pendingContractActions.clear();
      state.consumedContractActions.clear();
      state.contractActionIds = Object.freeze(model.actionIds.slice());
      const callback = function(payload) {
        return routeContractAskAction(
          payload, tuple, entityToken, requestActionToken, response.projectionToken,
          contractEpoch, askEpoch, model
        );
      };
      if (!renderContractAskModel(model, callback) || !currentContractAskAuthority(
        tuple, entityToken, requestActionToken, response.projectionToken, contractEpoch, askEpoch
      )) {
        withdrawContractProjection();
        return false;
      }
      return true;
    }

    async function dispatchContractAsk(
      rawQuestion, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
    ) {
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || !state.contractAskScope || !['editing', 'error'].includes(state.contractAskState)) return false;
      const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : '';
      state.contractAskEpoch += 1;
      const requestEpoch = state.contractAskEpoch;
      state.contractActionIds = Object.freeze([]);
      state.pendingContractActions.clear();
      state.consumedContractActions.clear();
      state.contractAskConfirmation = null;
      if (!safeContractQuestion(question)) {
        return renderContractAskError(
          'invalid-question', tuple, entityToken, requestActionToken, projectionToken,
          contractEpoch, requestEpoch, null
        );
      }
      state.contractAskState = 'checking';
      state.contractAskQuestion = question;
      if (!renderLocalContractAsk(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, requestEpoch,
        'checking', question, null
      )) return false;
      const request = contractAskClaim(
        'skopeo:hud-ask', tuple, entityToken, projectionToken,
        { scopeToken: state.contractAskScope.scopeToken, question: question }
      );
      if (!request) return false;
      let response;
      try { response = await chrome.runtime.sendMessage(request); } catch (_error) { response = null; }
      if (response) {
        try { response = JSON.parse(JSON.stringify(response)); } catch (_error) { response = null; }
      }
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, requestEpoch
      ) || state.contractAskState !== 'checking') return false;
      if (!exactContractAnswerAuthority(response, request, requestActionToken)) {
        return renderContractAskError(
          'provider-unavailable', tuple, entityToken, requestActionToken, projectionToken,
          contractEpoch, requestEpoch, question
        );
      }
      const model = contractAskModelForProjection(response);
      if (!model || model.scope.scopeToken !== response.body.scope.scopeToken) {
        withdrawContractProjection();
        return false;
      }
      return installContractAnswer(
        response, model, tuple, entityToken, requestActionToken, contractEpoch, requestEpoch
      );
    }

    function editContractAsk(
      question, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
    ) {
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || !['editing', 'error'].includes(state.contractAskState)) return false;
      const next = typeof question === 'string' ? question : null;
      if (next !== null && !safeContractQuestion(next)) return false;
      state.contractAskEpoch += 1;
      const nextEpoch = state.contractAskEpoch;
      state.contractAskState = 'editing';
      return renderLocalContractAsk(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, nextEpoch,
        'editing', next, null
      );
    }

    function cancelCurrentContractAsk(
      tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
    ) {
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || state.contractAskState !== 'checking') return false;
      cancelContractAskBestEffort();
      state.contractAskEpoch += 1;
      const nextEpoch = state.contractAskEpoch;
      state.contractAskState = 'editing';
      return renderLocalContractAsk(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, nextEpoch,
        'editing', state.contractAskQuestion, null
      );
    }

    function backFromContractAsk() {
      if (state.contractAskState === 'idle') return false;
      return refreshContractForCurrentContext();
    }

    function askAnotherContractQuestion(
      tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
    ) {
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || state.contractAskState !== 'result' || !state.contractAskScope) return false;
      state.contractAskEpoch += 1;
      const nextEpoch = state.contractAskEpoch;
      state.contractAskState = 'editing';
      state.contractAskQuestion = null;
      state.contractAskConfirmation = null;
      state.contractActionIds = Object.freeze([]);
      state.pendingContractActions.clear();
      state.consumedContractActions.clear();
      return renderLocalContractAsk(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, nextEpoch,
        'editing', null, null
      );
    }

    function exactConfirmationResponse(value) {
      if (!hasExactOwnKeys(value, [
        'success', 'status', 'confirmationToken', 'consequence'
      ]) || value.success !== true || value.status !== 'confirmation-required' ||
          !boundedText(value.confirmationToken, 192) ||
          !hasExactOwnKeys(value.consequence, ['title', 'effect', 'detail']) ||
          !boundedText(value.consequence.detail, 512)) return false;
      const policy = ['Configure Document 10', 'Replace Document 10', 'Clear Document 10',
        'Classify as complex', 'Remove complex classification'].includes(value.consequence.title) &&
        value.consequence.effect === 'local-policy-write';
      const alert = ['Map current owner', 'Remove current owner mapping'].includes(
        value.consequence.title
      ) && value.consequence.effect === 'local-alert-owner-mapping';
      return policy || alert;
    }

    function confirmationCopy(value, actionId) {
      const title = value.consequence.title;
      const classification = title === 'Classify as complex' ||
        title === 'Remove complex classification';
      const alert = value.consequence.effect === 'local-alert-owner-mapping';
      return Object.freeze({
        confirmationModelVersion: 'skopeo-contract-confirmation/1',
        attention: 'interstitial',
        mode: 'confirmation',
        eyebrow: alert ? 'LOCAL ALERT RECIPIENT' :
          classification ? 'AGREEMENT CLASSIFICATION' : 'POLICY CONFIGURATION',
        title: title,
        body: title === 'Configure Document 10'
          ? 'Future applicable decisions will require review of this document’s current accessible revision.'
          : title === 'Classify as complex'
            ? 'A current human-authored memo will be required before applicable decisions can be cleared.'
            : value.consequence.detail,
        safeAction: Object.freeze({
          kind: 'confirmation-cancel',
          label: title === 'Classify as complex' ? 'Keep routine classification' :
            title === 'Remove complex classification' ? 'Keep complex classification' :
              title === 'Map current owner' ? 'Keep alerts unmapped' :
                title === 'Remove current owner mapping' ? 'Keep current owner mapping' :
                  'Keep current policy document'
        }),
        confirmAction: Object.freeze({
          kind: alert ? 'alert-confirm' : 'answer-confirm',
          label: title,
          actionId: actionId,
          confirmationToken: value.confirmationToken
        })
      });
    }

    function renderContractConfirmation(model, callback) {
      return !!state.shell && typeof state.shell.renderContractConfirmation === 'function' &&
        state.shell.renderContractConfirmation(model, callback) === true;
    }

    async function dispatchContractAlertAction(
      actionId, tuple, entityToken, requestActionToken, projectionToken, contractEpoch
    ) {
      if (!currentContractAction(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, actionId
      ) || state.pendingContractActions.has(actionId)) return false;
      state.pendingContractActions.add(actionId);
      const request = contractAskClaim(
        'skopeo:hud-alert-action', tuple, entityToken, projectionToken, { actionId: actionId }
      );
      let response;
      try { response = request ? await chrome.runtime.sendMessage(request) : null; } catch (_error) {
        response = null;
      }
      if (response) {
        try { response = JSON.parse(JSON.stringify(response)); } catch (_error) { response = null; }
      }
      const current = currentContractAction(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, actionId
      ) && state.pendingContractActions.has(actionId);
      state.pendingContractActions.delete(actionId);
      if (!current || !exactConfirmationResponse(response) ||
          response.consequence.effect !== 'local-alert-owner-mapping') return false;
      state.consumedContractActions.add(actionId);
      const confirmation = confirmationCopy(response, actionId);
      const callback = function(payload) {
        return routeContractAlertConfirmationAction(
          payload, tuple, entityToken, requestActionToken, projectionToken,
          contractEpoch, confirmation
        );
      };
      if (!renderContractConfirmation(confirmation, callback)) return false;
      state.contractAskConfirmation = confirmation;
      return true;
    }

    async function confirmContractAlertAction(
      actionId, confirmationToken, tuple, entityToken, requestActionToken,
      projectionToken, contractEpoch
    ) {
      const confirmation = state.contractAskConfirmation;
      if (!confirmation || confirmation.confirmAction.kind !== 'alert-confirm' ||
          !currentContractViewAuthority(
            tuple, entityToken, requestActionToken, projectionToken, contractEpoch
          ) || confirmation.confirmAction.actionId !== actionId ||
          confirmation.confirmAction.confirmationToken !== confirmationToken) return false;
      state.contractAskConfirmation = null;
      const request = contractAskClaim(
        'skopeo:hud-alert-action-confirm', tuple, entityToken, projectionToken,
        { actionId: actionId, confirmationToken: confirmationToken }
      );
      let response;
      try { response = request ? await chrome.runtime.sendMessage(request) : null; } catch (_error) {
        response = null;
      }
      if (response) {
        try { response = JSON.parse(JSON.stringify(response)); } catch (_error) { response = null; }
      }
      if (!currentContractViewAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch
      )) return false;
      const committed = hasExactOwnKeys(response, ['success', 'status']) &&
        response.success === true && response.status === 'committed';
      refreshContractForCurrentContext();
      return committed;
    }

    function routeContractAlertConfirmationAction(
      payload, tuple, entityToken, requestActionToken, projectionToken,
      contractEpoch, confirmation
    ) {
      if (!payload || !confirmation || state.contractAskConfirmation !== confirmation) return false;
      if (hasExactOwnKeys(payload, ['kind']) && payload.kind === 'confirmation-cancel') {
        state.contractAskConfirmation = null;
        return refreshContractForCurrentContext();
      }
      if (!hasExactOwnKeys(payload, ['kind', 'actionId', 'confirmationToken']) ||
          payload.kind !== 'alert-confirm') return false;
      return confirmContractAlertAction(
        payload.actionId, payload.confirmationToken, tuple, entityToken,
        requestActionToken, projectionToken, contractEpoch
      );
    }

    function installRefreshedContractAnswer(
      response, tuple, entityToken, requestActionToken, contractEpoch, askEpoch
    ) {
      const request = {
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: entityToken
      };
      if (!exactContractAnswerAuthority(response, request, requestActionToken)) return false;
      const model = contractAskModelForProjection(response);
      return !!model && installContractAnswer(
        response, model, tuple, entityToken, requestActionToken, contractEpoch, askEpoch
      );
    }

    async function dispatchContractAnswerAction(
      actionId, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
    ) {
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || state.contractAskState !== 'result' || !contractTokenInCurrentModel(actionId) ||
          state.pendingContractActions.has(actionId) || state.consumedContractActions.has(actionId)) return false;
      state.pendingContractActions.add(actionId);
      const request = contractAskClaim(
        'skopeo:hud-answer-action', tuple, entityToken, projectionToken, { actionId: actionId }
      );
      let response;
      try { response = request ? await chrome.runtime.sendMessage(request) : null; } catch (_error) {
        response = null;
      }
      if (response) {
        try { response = JSON.parse(JSON.stringify(response)); } catch (_error) { response = null; }
      }
      const current = currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) && state.pendingContractActions.has(actionId);
      state.pendingContractActions.delete(actionId);
      if (!current) return false;
      state.consumedContractActions.add(actionId);
      if (hasExactOwnKeys(response, ['success', 'status']) &&
          response.success === true && response.status === 'opened') {
        return true;
      }
      if (exactConfirmationResponse(response)) {
        const confirmation = confirmationCopy(response, actionId);
        const callback = function(payload) {
          return routeContractConfirmationAction(
            payload, tuple, entityToken, requestActionToken, projectionToken,
            contractEpoch, askEpoch, confirmation
          );
        };
        if (!renderContractConfirmation(confirmation, callback)) return false;
        state.contractAskConfirmation = confirmation;
        return true;
      }
      return installRefreshedContractAnswer(
        response, tuple, entityToken, requestActionToken, contractEpoch, askEpoch
      );
    }

    async function confirmContractAnswerAction(
      actionId, confirmationToken, tuple, entityToken, requestActionToken,
      projectionToken, contractEpoch, askEpoch
    ) {
      const confirmation = state.contractAskConfirmation;
      if (!confirmation || !currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      ) || confirmation.confirmAction.actionId !== actionId ||
          confirmation.confirmAction.confirmationToken !== confirmationToken) return false;
      state.contractAskConfirmation = null;
      const request = contractAskClaim(
        'skopeo:hud-answer-action-confirm', tuple, entityToken, projectionToken,
        { actionId: actionId, confirmationToken: confirmationToken }
      );
      let response;
      try { response = request ? await chrome.runtime.sendMessage(request) : null; } catch (_error) {
        response = null;
      }
      if (response) {
        try { response = JSON.parse(JSON.stringify(response)); } catch (_error) { response = null; }
      }
      if (!currentContractAskAuthority(
        tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
      )) return false;
      return installRefreshedContractAnswer(
        response, tuple, entityToken, requestActionToken, contractEpoch, askEpoch
      );
    }

    function routeContractConfirmationAction(
      payload, tuple, entityToken, requestActionToken, projectionToken,
      contractEpoch, askEpoch, confirmation
    ) {
      if (!payload || !confirmation || state.contractAskConfirmation !== confirmation) return false;
      if (hasExactOwnKeys(payload, ['kind']) && payload.kind === 'confirmation-cancel') {
        state.contractAskConfirmation = null;
        state.consumedContractActions.add(confirmation.confirmAction.actionId);
        return refreshContractForCurrentContext();
      }
      if (!hasExactOwnKeys(payload, ['kind', 'actionId', 'confirmationToken']) ||
          payload.kind !== 'answer-confirm') return false;
      return confirmContractAnswerAction(
        payload.actionId, payload.confirmationToken, tuple, entityToken, requestActionToken,
        projectionToken, contractEpoch, askEpoch
      );
    }

    function routeContractAskAction(
      payload, tuple, entityToken, requestActionToken, projectionToken,
      contractEpoch, askEpoch, model
    ) {
      if (typeof payload === 'string') {
        return dispatchContractAnswerAction(
          payload, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
        );
      }
      if (!payload || typeof payload !== 'object') return false;
      if (hasExactOwnKeys(payload, ['kind', 'question']) && payload.kind === 'ask-dispatch') {
        return dispatchContractAsk(
          payload.question, tuple, entityToken, requestActionToken, projectionToken,
          contractEpoch, askEpoch
        );
      }
      if (hasExactOwnKeys(payload, ['kind', 'question']) && payload.kind === 'ask-edit') {
        return editContractAsk(
          payload.question, tuple, entityToken, requestActionToken, projectionToken,
          contractEpoch, askEpoch
        );
      }
      if (hasExactOwnKeys(payload, ['kind']) && payload.kind === 'ask-clear') {
        return editContractAsk(
          null, tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
        );
      }
      if (hasExactOwnKeys(payload, ['kind']) && payload.kind === 'ask-cancel') {
        return cancelCurrentContractAsk(
          tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
        );
      }
      if (hasExactOwnKeys(payload, ['kind']) && payload.kind === 'ask-back') {
        return backFromContractAsk();
      }
      if (hasExactOwnKeys(payload, ['kind']) && payload.kind === 'ask-another') {
        return askAnotherContractQuestion(
          tuple, entityToken, requestActionToken, projectionToken, contractEpoch, askEpoch
        );
      }
      if (hasExactOwnKeys(payload, ['kind', 'actionId']) && payload.kind === 'answer-action' &&
          model && model.mode === 'answer') {
        return dispatchContractAnswerAction(
          payload.actionId, tuple, entityToken, requestActionToken, projectionToken,
          contractEpoch, askEpoch
        );
      }
      return false;
    }
    /* FSB_SKOPEO_CONTRACT_RUNTIME_END */

    function composeCorpusModel(tuple, actionToken, projection) {
      const composer = window.FSBSkopeoAdaptiveComposer;
      if (!tuple || !composer || typeof composer.composeCorpus !== 'function') return null;
      try {
        return composer.composeCorpus({
          authority: corpusAuthority(tuple),
          semanticEntity: tuple.semanticEntity,
          actionToken: actionToken,
          projection: projection
        });
      } catch (_error) {
        return null;
      }
    }

    function corpusClaim(action, tuple, actionToken) {
      const token = semanticEntityToken(tuple.semanticEntity);
      if (!token || ![
        'skopeo:corpus-enroll', 'skopeo:corpus-root-status', 'skopeo:corpus-status'
      ].includes(action)) return null;
      const claim = {
        action: action,
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntityToken: token,
        actionToken: actionToken
      };
      if (action === 'skopeo:corpus-enroll' || action === 'skopeo:corpus-root-status') {
        if (tuple.semanticEntity.kind !== 'drive-folder') return null;
        claim.corpusRootFileId = tuple.semanticEntity.id;
      } else if (tuple.semanticEntity.kind === 'drive-file' || tuple.semanticEntity.kind === 'docs-document') {
        claim.currentSourceFileId = tuple.semanticEntity.id;
      } else {
        return null;
      }
      return claim;
    }

    function contractOwnsSharedSurface() {
      return state.pendingContractToken !== null || state.contractViewToken !== null;
    }

    async function requestCorpusProjection(action, tuple, actionToken) {
      const request = corpusClaim(action, tuple, actionToken);
      if (!request || state.pendingCorpusToken !== actionToken || !sameCurrentCorpusTuple(tuple)) return false;
      let response;
      try {
        response = await chrome.runtime.sendMessage(request);
      } catch (_error) {
        response = null;
      }
      if (!isLive(tuple.generation) || state.pendingCorpusToken !== actionToken ||
          !sameCurrentCorpusTuple(tuple)) return false;
      if (contractOwnsSharedSurface()) {
        if (state.pendingCorpusToken === actionToken) state.pendingCorpusToken = null;
        return false;
      }
      const model = composeCorpusModel(tuple, actionToken, response);
      if (!model || !sameCurrentCorpusTuple(tuple) || state.pendingCorpusToken !== actionToken ||
          !state.shell || typeof state.shell.renderCorpus !== 'function') {
        if (state.pendingCorpusToken === actionToken) state.pendingCorpusToken = null;
        return false;
      }
      const rendered = state.shell.renderCorpus(model) === true;
      if (!rendered || !sameCurrentCorpusTuple(tuple) || state.pendingCorpusToken !== actionToken) {
        if (state.pendingCorpusToken === actionToken) state.pendingCorpusToken = null;
        return false;
      }
      state.pendingCorpusToken = null;
      state.corpusModelToken = model.mode === 'enrollment' ? actionToken : null;
      return true;
    }

    function refreshCorpusForCurrentContext() {
      state.corpusActionEpoch += 1;
      state.corpusModelToken = null;
      state.pendingCorpusToken = null;
      state.consumedCorpusToken = null;
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted || !state.shell) return false;
      if (contractOwnsSharedSurface()) return false;
      const tuple = currentCorpusTuple();
      if (!tuple) return false;
      const actionToken = nextCorpusActionToken();
      if (tuple.semanticEntity.kind === 'drive-folder') {
        state.pendingCorpusToken = actionToken;
        Promise.resolve(requestCorpusProjection(
          'skopeo:corpus-root-status', tuple, actionToken
        )).catch(function () {});
        return true;
      }
      state.pendingCorpusToken = actionToken;
      Promise.resolve(requestCorpusProjection('skopeo:corpus-status', tuple, actionToken)).catch(function () {});
      return true;
    }

    function validCorpusActionPayload(payload) {
      return hasExactOwnKeys(payload, [
        'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
        'semanticEntityToken', 'actionToken'
      ]) && isPositiveGeneration(payload.generation) && isPositiveGeneration(payload.contextEpoch) &&
        boundedText(payload.exactOrigin, 320) && boundedText(payload.profileVersion, 128) &&
        boundedText(payload.semanticEntityToken, 680) && boundedText(payload.actionToken, MAX_ACTION_TOKEN_LENGTH);
    }

    function onCorpusAction(payload) {
      if (!validCorpusActionPayload(payload) || !isLive(state.generation) ||
          state.phase !== 'active' || !state.mounted) return false;
      const tuple = currentCorpusTuple();
      if (!tuple || tuple.semanticEntity.kind !== 'drive-folder' ||
          payload.generation !== tuple.generation || payload.exactOrigin !== tuple.exactOrigin ||
          payload.profileVersion !== tuple.profileVersion || payload.contextEpoch !== tuple.contextEpoch ||
          payload.semanticEntityToken !== semanticEntityToken(tuple.semanticEntity) ||
          payload.actionToken !== state.corpusModelToken ||
          payload.actionToken === state.consumedCorpusToken) return false;
      state.consumedCorpusToken = payload.actionToken;
      state.corpusModelToken = null;
      state.pendingCorpusToken = payload.actionToken;
      if (state.shell && typeof state.shell.withdrawCorpus === 'function') {
        try { state.shell.withdrawCorpus(); } catch (_error) {}
      }
      Promise.resolve(requestCorpusProjection(
        'skopeo:corpus-enroll', tuple, payload.actionToken
      )).catch(function () {});
      return true;
    }

    function adapterEvidenceForUrl(rawUrl) {
      const evidence = [];
      let parsed;
      try { parsed = new URL(rawUrl); } catch (_error) { return evidence; }
      if (!state.projection || parsed.origin !== state.projection.exactOrigin) return evidence;
      if (state.projection.profile.adapterId !== 'drive-docs-deep-pack-v1') return evidence;
      evidence.push({ signal: 'exact-origin', value: parsed.origin });
      let match;
      if (parsed.origin === 'https://docs.google.com') {
        match = parsed.pathname.match(/\/document\/d\/([A-Za-z0-9._:-]+)/);
        evidence.push({ signal: 'trusted-context-kind', value: 'agreement-reading' });
        if (match) evidence.push({ signal: 'docs-document-id', value: match[1] });
      } else {
        match = parsed.pathname.match(/\/(?:folders|file\/d)\/([A-Za-z0-9._:-]+)/);
        evidence.push({
          signal: 'trusted-context-kind',
          value: parsed.pathname.includes('/folders/') ? 'vendor-folder' : 'focused-ask'
        });
        if (match) evidence.push({ signal: 'drive-item-id', value: match[1] });
      }
      if (match) evidence.push({ signal: 'visible-label', value: match[1].slice(0, 80) });
      return evidence;
    }

    function ensureContextResolver() {
      if (state.contextResolver) return true;
      const resolverApi = window.FSBSkopeoAppContextResolver;
      const adapters = window.FSBSkopeoAdapterRegistry;
      if (!projectionAuthorityIsCurrent() || !resolverApi || typeof resolverApi.createResolver !== 'function' ||
          !adapters || typeof adapters.resolve !== 'function') return false;
      try {
        state.contextResolver = resolverApi.createResolver({
          generation: state.generation,
          projection: state.projection,
          resolveAdapter: adapters.resolve
        });
        return true;
      } catch (_error) {
        state.contextResolver = null;
        return false;
      }
    }

    function invalidatePendingArguments() {
      state.collectionEpoch += 1;
      state.pendingArgumentCollection = null;
    }

    function resolveAdaptiveContext(rawUrl) {
      if (!ensureContextResolver() || !isLive(state.generation)) return false;
      let context;
      try {
        context = state.contextResolver.resolve({
          url: rawUrl,
          requestedLens: 'app-actions',
          adapterEvidence: adapterEvidenceForUrl(rawUrl)
        });
      } catch (_error) {
        return false;
      }
      if (!context || context.status !== 'recognized' ||
          !window.FSBSkopeoAppContextResolver.validateResult(context)) return false;
      state.appContext = context;
      state.selectedGroupId = null;
      state.selectedActionSlug = null;
      state.adaptiveResult = null;
      state.renderedAtoms = Object.freeze([]);
      state.pendingActionToken = null;
      state.pendingConsequence = null;
      state.pendingConsequenceAction = null;
      invalidatePendingArguments();
      state.actionEpoch += 1;
      return context;
    }

    function composerResult(status, actionLabel, recovery) {
      return deepFreeze({
        status: status,
        actionLabel: actionLabel === undefined ? null : actionLabel,
        recovery: recovery === undefined ? null : recovery
      });
    }

    function composeAndRender(intentKind, result, consequence, renderedAtoms, argumentCollection, requiredAttention) {
      if (!projectionAuthorityIsCurrent() || state.phase !== 'active' || !state.mounted ||
          !state.appContext || !state.shell || typeof state.shell.renderAdaptive !== 'function') return false;
      const tuple = currentAdaptiveTuple();
      const composer = window.FSBSkopeoAdaptiveComposer;
      if (!tuple || !composer || typeof composer.compose !== 'function') return false;
      let model;
      try {
        model = composer.compose({
          context: state.appContext,
          intent: {
            kind: intentKind,
            source: intentKind === 'initial' ? 'explicit-invocation' : 'skopeo-control'
          },
          selectedGroupId: state.selectedGroupId,
          selectedActionSlug: state.selectedActionSlug,
          anomalyEvidence: null,
          result: result || null,
          consequence: consequence || null,
          argumentCollection: argumentCollection || null
        });
      } catch (_error) {
        return false;
      }
      const atoms = Array.isArray(renderedAtoms) ? renderedAtoms : [];
      if (!model || (requiredAttention && model.attention !== requiredAttention) ||
          (requiredAttention === 'interstitial' && !model.consequence) ||
          !sameAdaptiveTuple(tuple, currentAdaptiveTuple()) || !isLive(state.generation)) return false;
      const rendered = state.shell.renderAdaptive(model, atoms) === true;
      if (!rendered || !sameAdaptiveTuple(tuple, currentAdaptiveTuple()) || !isLive(state.generation)) return false;
      state.adaptiveModel = model;
      state.renderedAtoms = Object.freeze(atoms.slice());
      state.attention = model.attention;
      return true;
    }

    function findContextCapability(groupId, slug) {
      if (!state.appContext || !Array.isArray(state.appContext.capabilityGroups)) return null;
      let match = null;
      for (const group of state.appContext.capabilityGroups) {
        if (group.id !== groupId || !Array.isArray(group.capabilities)) continue;
        for (const row of group.capabilities) {
          if (row.slug === slug) {
            if (match) return null;
            match = row;
          }
        }
      }
      return match;
    }

    function actionPayload(action, tuple, slug, args, actionToken, schemaDigest) {
      const payload = {
        action: action,
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileVersion: tuple.profileVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntity: tuple.semanticEntity,
        slug: slug,
        args: args
      };
      if (action === 'skopeo:read-invoke') {
        payload.profileId = tuple.profileId;
        payload.catalogVersion = tuple.catalogVersion;
        payload.actionToken = actionToken;
        payload.schemaDigest = schemaDigest;
      } else if (actionToken) {
        payload.actionToken = actionToken;
      }
      return payload;
    }

    function nextActionToken() {
      state.actionEpoch += 1;
      return 'sr1_' + String(state.generation) + '_' + String(state.actionEpoch) + '_' +
        String(Date.now()).slice(-12);
    }

    function exactReadResponse(value, request, tuple) {
      return hasExactOwnKeys(value, [
        'success', 'generation', 'exactOrigin', 'profileId', 'profileVersion', 'catalogVersion',
        'contextEpoch', 'semanticEntity', 'slug', 'actionToken', 'result'
      ]) && value.success === true && value.generation === tuple.generation &&
        value.exactOrigin === tuple.exactOrigin && value.profileId === tuple.profileId &&
        value.profileVersion === tuple.profileVersion && value.catalogVersion === tuple.catalogVersion &&
        value.contextEpoch === tuple.contextEpoch && validSemanticEntity(value.semanticEntity) &&
        sameEntity(value.semanticEntity, tuple.semanticEntity) && value.slug === request.slug &&
        value.actionToken === request.actionToken && isPlainObject(value.result);
    }

    function renderTypedResult(typedResult) {
      const renderer = window.FSBSkopeoRendererRegistry;
      if (!renderer || typeof renderer.render !== 'function' || !state.projection ||
          !state.projection.profile) return null;
      try {
        const atoms = renderer.render(state.projection.profile.rendererId, typedResult, {
          width: Number(window.innerWidth) || 1024
        });
        return Array.isArray(atoms) && renderer.validateAtoms(atoms) ? atoms : null;
      } catch (_error) {
        return null;
      }
    }

    async function invokeSelectedRead(row, args) {
      const tuple = currentAdaptiveTuple();
      const authority = window.FsbSkopeoActionAuthority;
      if (!tuple || !row || row.presentationDisposition !== 't1-ready' || row.invocable !== true ||
          row.sideEffectClass !== 'read' || row.executionOrigin !== tuple.exactOrigin ||
          !authority || typeof authority.validateCollectedArguments !== 'function' ||
          authority.validateCollectedArguments(row.argumentContract, args) !== true) return false;
      const token = nextActionToken();
      state.pendingActionToken = token;
      composeAndRender('select-action', composerResult('pending', row.actionLabel, null), null, []);
      const request = actionPayload('skopeo:read-invoke', tuple, row.slug, args, token,
        row.argumentContract.schemaDigest);
      let response;
      try {
        response = await chrome.runtime.sendMessage(request);
      } catch (_error) {
        response = null;
      }
      if (!isLive(tuple.generation) || state.pendingActionToken !== token ||
          !sameAdaptiveTuple(tuple, currentAdaptiveTuple())) return false;
      state.pendingActionToken = null;
      if (!exactReadResponse(response, request, tuple)) {
        return composeAndRender('select-action', composerResult(
          'error', row.actionLabel, 'Review the target and try the action again.'
        ), null, []);
      }
      const atoms = renderTypedResult(response.result);
      if (!atoms || !sameAdaptiveTuple(tuple, currentAdaptiveTuple()) || !isLive(tuple.generation)) return false;
      state.adaptiveResult = response.result;
      return composeAndRender('select-action', composerResult(
        response.result.status === 'success' ? 'success' : 'error',
        row.actionLabel,
        response.result.status === 'success' ? null : 'Review the target and try the action again.'
      ), null, atoms);
    }

    async function openSelectedConsequence(row, args) {
      const tuple = currentAdaptiveTuple();
      const authority = window.FsbSkopeoActionAuthority;
      if (!tuple || !row || !['write', 'destructive'].includes(row.sideEffectClass) ||
          row.executionOrigin !== tuple.exactOrigin || !authority ||
          typeof authority.validateCollectedArguments !== 'function' ||
          authority.validateCollectedArguments(row.argumentContract, args) !== true) return false;
      const request = actionPayload('skopeo:consequence-open', tuple, row.slug, args, null);
      const epoch = ++state.actionEpoch;
      let response;
      try { response = await chrome.runtime.sendMessage(request); } catch (_error) { response = null; }
      if (!isLive(tuple.generation) || epoch !== state.actionEpoch ||
          !sameAdaptiveTuple(tuple, currentAdaptiveTuple()) || !response || response.status !== 'open' ||
          !boundedText(response.actionToken, MAX_ACTION_TOKEN_LENGTH) ||
          !isPlainObject(response.confirmation)) return false;
      state.pendingConsequence = deepFreeze({
        tuple: tuple,
        slug: row.slug,
        args: args,
        actionToken: response.actionToken,
        confirmation: response.confirmation
      });
      const rendered = composeAndRender(
        'select-action', null, response.confirmation, [], null, 'interstitial'
      );
      if (rendered) return true;
      await finishConsequence('skopeo:consequence-cancel', { restoreFocused: false });
      if (!sameAdaptiveTuple(tuple, currentAdaptiveTuple()) || !isLive(tuple.generation)) return false;
      return composeAndRender('select-action', composerResult(
        'error', row.actionLabel, 'Skopeo could not display a complete confirmation. Review the action and try again.'
      ), null, []);
    }

    function exactCancelledConsequenceResponse(response) {
      return hasExactOwnKeys(response, ['status', 'reason']) &&
        response.status === 'cancelled' && response.reason === 'cancelled';
    }

    async function finishConsequence(action, options) {
      const pending = state.pendingConsequence;
      const restoreFocused = action === 'skopeo:consequence-cancel' &&
        !!options && options.restoreFocused === true;
      if (!pending || state.pendingConsequenceAction !== null ||
          !sameAdaptiveTuple(pending.tuple, currentAdaptiveTuple())) return false;
      const operation = Object.freeze({ action: action, actionToken: pending.actionToken });
      state.pendingConsequenceAction = operation;
      const request = actionPayload(action, pending.tuple, pending.slug, pending.args, pending.actionToken);
      const epoch = ++state.actionEpoch;
      let response;
      try { response = await chrome.runtime.sendMessage(request); } catch (_error) { response = null; }
      const operationStillOwned = state.pendingConsequenceAction === operation;
      const tupleStillCurrent = sameAdaptiveTuple(pending.tuple, currentAdaptiveTuple());
      const generationStillLive = isLive(pending.tuple.generation);
      if (!generationStillLive || epoch !== state.actionEpoch ||
          !operationStillOwned || !tupleStillCurrent) {
        if (action === 'skopeo:consequence-cancel' && generationStillLive &&
            operationStillOwned && tupleStillCurrent) {
          state.pendingConsequenceAction = null;
          requestKill(restoreFocused ? 'escape' : 'unsafe-layout');
        }
        return false;
      }
      if (action === 'skopeo:consequence-cancel' && !exactCancelledConsequenceResponse(response)) {
        state.pendingConsequenceAction = null;
        requestKill(restoreFocused ? 'escape' : 'unsafe-layout');
        return false;
      }
      state.pendingConsequence = null;
      state.pendingConsequenceAction = null;
      if (action === 'skopeo:consequence-cancel') {
        if (!restoreFocused) return true;
        const restored = state.shell && state.shell.back() === true;
        const shellSnapshot = restored && typeof state.shell.getSnapshot === 'function'
          ? state.shell.getSnapshot()
          : null;
        if (!restored || !shellSnapshot || shellSnapshot.attention !== 'focused') {
          requestKill('unsafe-layout');
          return false;
        }
        state.attention = 'focused';
        return true;
      }
      const success = !!response && response.success === true;
      const typed = success
        ? deepFreeze({
          status: 'success',
          actionLabel: state.selectedActionSlug || 'Selected action',
          sections: [{
            kind: 'notice', tone: 'info', heading: 'Action complete',
            message: 'The confirmed action completed through the capability router.',
            nextStep: 'Review the service and continue in the current view.'
          }]
        })
        : deepFreeze({
          status: 'error', actionLabel: state.selectedActionSlug || 'Selected action',
          errorCode: 'SKOPEO_ROUTER_ERROR'
        });
      const atoms = renderTypedResult(typed) || [];
      return composeAndRender('select-action', composerResult(
        success ? 'success' : 'error',
        state.selectedActionSlug,
        success ? null : 'Review the target and try the action again.'
      ), null, atoms);
    }

    function firstInvalidArgumentField(contract, values) {
      if (!contract || !Array.isArray(contract.fields) || !isPlainObject(values)) return null;
      for (const field of contract.fields) {
        const present = Object.prototype.hasOwnProperty.call(values, field.name);
        const value = present ? values[field.name] : undefined;
        if (!present) {
          if (field.required) return field.name;
          continue;
        }
        if (!field.required && value === '' && field.kind !== 'boolean') continue;
        if (field.kind === 'string') {
          if (typeof value !== 'string' || value.length < field.minLength ||
              value.length > field.maxLength) return field.name;
          continue;
        }
        if (field.kind === 'boolean') {
          if (typeof value !== 'boolean') return field.name;
          continue;
        }
        if (field.kind === 'choice') {
          let choice = value;
          const first = field.choices[0];
          if (typeof first === 'boolean' && value === 'true') choice = true;
          if (typeof first === 'boolean' && value === 'false') choice = false;
          if (typeof first === 'number' && typeof value === 'string' && value !== '') choice = Number(value);
          if (!field.choices.includes(choice)) return field.name;
          continue;
        }
        const syntax = field.kind === 'integer'
          ? /^-?(?:0|[1-9][0-9]*)$/
          : /^-?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
        const number = typeof value === 'number' ? value
          : (typeof value === 'string' && syntax.test(value) ? Number(value) : NaN);
        if (!Number.isFinite(number) || (field.kind === 'integer' && !Number.isSafeInteger(number)) ||
            (field.minimum !== null && number < field.minimum) ||
            (field.maximum !== null && number > field.maximum)) return field.name;
      }
      const allowed = new Set(contract.fields.map(function (field) { return field.name; }));
      if (Reflect.ownKeys(values).some(function (key) {
        return typeof key !== 'string' || !allowed.has(key);
      })) return contract.fields.length ? contract.fields[0].name : null;
      return contract.fields.length ? contract.fields[0].name : null;
    }

    function dispatchSelectedAction(row, args) {
      if (!row) return false;
      if (row.sideEffectClass === 'read') {
        Promise.resolve(invokeSelectedRead(row, args)).catch(function () {});
        return true;
      }
      if (['write', 'destructive'].includes(row.sideEffectClass)) {
        Promise.resolve(openSelectedConsequence(row, args)).catch(function () {});
        return true;
      }
      return false;
    }

    function beginSelectedAction(row) {
      const tuple = currentAdaptiveTuple();
      const authority = window.FsbSkopeoActionAuthority;
      if (!tuple || !row || row.presentationDisposition !== 't1-ready' || row.invocable !== true ||
          row.executionEnabled !== true || row.executionOrigin !== tuple.exactOrigin ||
          !row.argumentContract || !['empty', 'form'].includes(row.argumentContract.mode) ||
          !authority || typeof authority.parseCollectedArguments !== 'function') return false;
      invalidatePendingArguments();
      if (row.argumentContract.mode === 'empty') {
        const parsed = authority.parseCollectedArguments(row.argumentContract, Object.freeze({}));
        return !!parsed && parsed.ok === true && dispatchSelectedAction(row, parsed.args);
      }
      const collectionEpoch = state.collectionEpoch;
      state.pendingArgumentCollection = deepFreeze({
        tuple: tuple,
        groupId: state.selectedGroupId,
        slug: row.slug,
        argumentContract: row.argumentContract,
        collectionEpoch: collectionEpoch
      });
      return composeAndRender('collect-arguments', null, null, [], {
        collectionEpoch: collectionEpoch,
        errorField: null,
        errorMessage: null
      });
    }

    function pendingCollectionMatches(payload) {
      const pending = state.pendingArgumentCollection;
      return !!pending && sameAdaptiveTuple(pending.tuple, currentAdaptiveTuple()) &&
        payload.collectionEpoch === pending.collectionEpoch && payload.groupId === pending.groupId &&
        payload.actionSlug === pending.slug;
    }

    function submitPendingArguments(payload) {
      if (!pendingCollectionMatches(payload)) return false;
      const pending = state.pendingArgumentCollection;
      const row = findContextCapability(pending.groupId, pending.slug);
      const authority = window.FsbSkopeoActionAuthority;
      if (!row || row.argumentContract !== pending.argumentContract ||
          row.sideEffectClass !== payload.sideEffectClass || !authority ||
          typeof authority.parseCollectedArguments !== 'function') return false;
      const parsed = authority.parseCollectedArguments(pending.argumentContract, payload.values);
      if (!parsed || parsed.ok !== true) {
        const errorField = firstInvalidArgumentField(pending.argumentContract, payload.values);
        if (!errorField) return false;
        return composeAndRender('collect-arguments', null, null, [], {
          collectionEpoch: pending.collectionEpoch,
          errorField: errorField,
          errorMessage: 'Check the highlighted field.'
        });
      }
      state.pendingArgumentCollection = null;
      state.collectionEpoch += 1;
      return dispatchSelectedAction(row, parsed.args);
    }

    function cancelPendingArguments(payload) {
      if (!pendingCollectionMatches(payload)) return false;
      const pending = state.pendingArgumentCollection;
      const row = findContextCapability(pending.groupId, pending.slug);
      if (!row || row.sideEffectClass !== payload.sideEffectClass) return false;
      invalidatePendingArguments();
      state.selectedGroupId = null;
      state.selectedActionSlug = null;
      return composeAndRender('open-actions', null, null, []);
    }

    function validAdaptiveActionPayload(payload) {
      if (!payload || typeof payload.kind !== 'string') return false;
      const base = [
        'kind', 'generation', 'exactOrigin', 'profileId', 'profileVersion', 'contextEpoch',
        'entity', 'groupId', 'actionSlug', 'sideEffectClass'
      ];
      if (payload.kind === 'submit-arguments') return hasExactOwnKeys(payload, base.concat([
        'collectionEpoch', 'values'
      ])) && isPositiveGeneration(payload.collectionEpoch) && isPlainObject(payload.values);
      if (payload.kind === 'cancel-arguments') return hasExactOwnKeys(payload, base.concat([
        'collectionEpoch'
      ])) && isPositiveGeneration(payload.collectionEpoch);
      return hasExactOwnKeys(payload, base);
    }

    function onAdaptiveAction(payload) {
      if (!validAdaptiveActionPayload(payload) || !projectionAuthorityIsCurrent() ||
          state.phase !== 'active' || !state.mounted) return false;
      const tuple = currentAdaptiveTuple();
      if (!tuple || payload.generation !== tuple.generation || payload.exactOrigin !== tuple.exactOrigin ||
          payload.profileId !== tuple.profileId || payload.profileVersion !== tuple.profileVersion ||
          payload.contextEpoch !== tuple.contextEpoch ||
          ((payload.entity === null) !== (tuple.semanticEntity === null)) ||
          (payload.entity && (payload.entity.kind !== tuple.semanticEntity.kind ||
            payload.entity.id !== tuple.semanticEntity.id))) return false;
      if (payload.kind === 'open-actions') {
        invalidatePendingArguments();
        state.selectedGroupId = null;
        state.selectedActionSlug = null;
        return composeAndRender('open-actions', null, null, []);
      }
      if (payload.kind === 'select-action') {
        const row = findContextCapability(payload.groupId, payload.actionSlug);
        if (!row || row.sideEffectClass !== payload.sideEffectClass ||
            row.presentationDisposition !== 't1-ready' || row.invocable !== true) return false;
        state.selectedGroupId = payload.groupId;
        state.selectedActionSlug = payload.actionSlug;
        return beginSelectedAction(row);
      }
      if (payload.kind === 'submit-arguments') {
        return submitPendingArguments(payload);
      }
      if (payload.kind === 'cancel-arguments') {
        return cancelPendingArguments(payload);
      }
      if (payload.kind === 'cancel-consequence') {
        Promise.resolve(finishConsequence(
          'skopeo:consequence-cancel', { restoreFocused: true }
        )).catch(function () {});
        return true;
      }
      if (payload.kind === 'confirm-consequence') {
        Promise.resolve(finishConsequence('skopeo:consequence-confirm')).catch(function () {});
        return true;
      }
      return false;
    }

    function adaptiveAuthorityResponse() {
      const tuple = currentAdaptiveTuple();
      if (!tuple || !ACTIVE_ATTENTION.includes(state.attention)) return false;
      return {
        success: true,
        generation: tuple.generation,
        exactOrigin: tuple.exactOrigin,
        profileId: tuple.profileId,
        profileVersion: tuple.profileVersion,
        catalogVersion: tuple.catalogVersion,
        contextEpoch: tuple.contextEpoch,
        semanticEntity: tuple.semanticEntity,
        attention: state.attention
      };
    }

    function currentSnapshot() {
      const resources = combinedResourceSnapshot(shellResourceSnapshot());
      return {
        generation: state.generation,
        phase: state.phase,
        terminal: state.terminal,
        disposed: state.disposed,
        aborted: !!(state.controller && state.controller.signal.aborted),
        mounted: state.mounted,
        attention: state.attention,
        resources: resources,
        reason: state.teardownReason,
        teardownOrder: state.teardownOrder.slice()
      };
    }

    function sendOutbound(message) {
      if (!message || Object.prototype.hasOwnProperty.call(message, 'tabId')) return false;
      try {
        const result = chrome.runtime.sendMessage(message);
        if (result && typeof result.catch === 'function') result.catch(function () {});
        return true;
      } catch (_error) {
        return false;
      }
    }

    function removeActiveListeners() {
      if (!state.activeListenersInstalled) return;
      window.removeEventListener('keydown', onKeydown, false);
      window.removeEventListener('pagehide', onPagehide, false);
      state.activeListenersInstalled = false;
      bumpRuntimeResource('listeners', -2);
    }

    function removeRuntimeListener() {
      if (!state.runtimeListenerInstalled) return;
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      state.runtimeListenerInstalled = false;
      bumpRuntimeResource('listeners', -1);
    }

    function terminateOwner(reason) {
      if (state.finalSnapshot) return state.finalSnapshot;

      // The terminal flag is the resurrection boundary. Nothing below may
      // render or send ready because every callback also checks isLive().
      state.terminal = true;
      state.disposed = true;
      state.phase = 'terminal';
      state.teardownReason = typeof reason === 'string' && reason ? reason : 'off';
      state.teardownOrder.push('terminal');

      state.teardownOrder.push('abort');
      if (state.controller && !state.controller.signal.aborted) {
        state.controller.abort(state.teardownReason);
      }
      state.actionEpoch += 1;
      state.pendingActionToken = null;
      state.pendingConsequence = null;
      state.pendingConsequenceAction = null;
      invalidatePendingArguments();
      withdrawContractProjection();
      withdrawCorpusProjection();

      state.teardownOrder.push('clear-fixture-timeout');
      if (state.fixtureTimerId !== null) {
        clearTimeout(state.fixtureTimerId);
        state.fixtureTimerId = null;
        bumpRuntimeResource('timeouts', -1);
      }

      state.teardownOrder.push('dispose-registry');
      if (state.registry && typeof state.registry.dispose === 'function') {
        try {
          state.registry.dispose();
        } catch (_error) {
          // The nonzero runtime ledger suppresses a false cleanup certificate.
        }
      }

      state.teardownOrder.push('dispose-router');
      if (state.contextResolver && typeof state.contextResolver.dispose === 'function') {
        try {
          state.contextResolver.dispose();
        } catch (_error) {
          // The resolver owns no host resources; terminal authority still wins.
        }
      }
      if (state.router && typeof state.router.dispose === 'function') {
        try {
          state.router.dispose();
        } catch (_error) {
          // Router disposal has no visual fallback; teardown continues closed.
        }
      }

      state.teardownOrder.push('destroy-shell');
      let shellResources = zeroResources();
      if (state.shell && typeof state.shell.destroy === 'function') {
        try {
          shellResources = state.shell.destroy(state.teardownReason);
        } catch (_error) {
          shellResources = shellResourceSnapshot();
        }
      }
      state.mounted = false;

      state.teardownOrder.push('unregister-key/pagehide-listeners');
      removeActiveListeners();

      state.teardownOrder.push('unregister-runtime-listener');
      removeRuntimeListener();

      state.teardownOrder.push('delete-fixture-hook/flag');
      delete api.activateControlledFixtureForTest;
      if (Object.prototype.hasOwnProperty.call(window, '__FSB_SKOPEO_TEST_FIXTURE__')) {
        delete window.__FSB_SKOPEO_TEST_FIXTURE__;
      }

      state.teardownOrder.push('delete-sentinel');
      if (window.__FSB_SKOPEO_RUNTIME__ === api) delete window.__FSB_SKOPEO_RUNTIME__;

      state.preparedPlacement = null;
      state.fixtureToken = null;
      state.fixtureActivated = false;
      state.lastEscapeAt = null;
      state.router = null;
      state.registry = null;
      state.routeResult = null;
      state.contextEpoch = 0;
      state.semanticIdentity = null;
      state.anchorAdapter = null;
      state.activeAnchorId = null;
      state.bindingEpoch = 0;
      state.shell = null;
      state.controller = null;
      state.contextResolver = null;
      state.appContext = null;
      state.adaptiveModel = null;
      state.adaptiveResult = null;
      state.renderedAtoms = Object.freeze([]);
      state.corpusModelToken = null;
      state.pendingCorpusToken = null;
      state.consumedCorpusToken = null;
      state.pendingContractToken = null;
      state.contractSemanticEntityToken = null;
      state.contractRequestActionToken = null;
      state.contractViewToken = null;
      state.contractActionIds = Object.freeze([]);
      state.pendingContractActions.clear();
      state.consumedContractActions.clear();
      state.projection = null;

      const resources = Object.freeze(combinedResourceSnapshot(shellResources));
      state.teardownOrder.push('teardown-complete');
      state.finalSnapshot = Object.freeze({
        generation: state.generation,
        phase: state.phase,
        terminal: true,
        disposed: true,
        aborted: true,
        mounted: false,
        attention: state.attention,
        resources: resources,
        reason: state.teardownReason,
        teardownOrder: Object.freeze(state.teardownOrder.slice())
      });
      if (isPositiveGeneration(state.generation) && resourcesAreExactZero(resources)) {
        sendOutbound({
          action: 'skopeo:teardown-complete',
          generation: state.generation,
          reason: state.teardownReason,
          resources: resources
        });
      }
      return state.finalSnapshot;
    }

    function requestKill(reason) {
      if (!isLive(state.generation)) return false;
      const allowedReason = reason === 'close' || reason === 'escape' ||
        reason === 'unsafe-layout' || reason === 'navigation'
        ? reason
        : 'close';
      sendOutbound({
        action: 'skopeo:kill-request',
        generation: state.generation,
        reason: allowedReason
      });
      terminateOwner(allowedReason);
      return true;
    }

    function onShellClose(payload) {
      requestKill(payload && payload.reason === 'back' ? 'escape' : 'close');
    }

    function onShellKill(payload) {
      const requested = payload && payload.reason;
      if (requested === 'unsafe-layout') requestKill('unsafe-layout');
      else if (typeof requested === 'string' && requested.indexOf('escape') !== -1) requestKill('escape');
      else requestKill('close');
    }

    function onShellEscape(payload) {
      if (!payload || !isLive(state.generation)) return;
      if (Number.isFinite(payload.timestamp)) state.lastEscapeAt = payload.timestamp;
      if (ACTIVE_ATTENTION.includes(payload.to)) state.attention = payload.to;
    }

    function configure(envelope) {
      if (state.disposed || state.configured || state.phase !== 'idle' || !isExactConfigure(envelope)) {
        return false;
      }
      const projection = cloneProjection(envelope.projection);
      if (!projection || !validProjection(projection, envelope.generation)) return false;
      state.generation = envelope.generation;
      state.projection = projection;
      state.configured = true;
      state.phase = 'configured';
      return true;
    }

    function prepare(envelope) {
      if (!isExactEnvelope(envelope, 'skopeo:prepare') || state.disposed || !state.configured ||
          !state.projection) return false;
      const generation = envelope.generation;
      if (generation !== state.generation) return false;
      if (generation === state.generation && (state.phase === 'prepared' || state.phase === 'active')) {
        return true;
      }
      if (state.phase !== 'configured') return false;
      state.phase = 'preparing';
      state.controller = new AbortController();
      state.fixtureToken = Object.freeze({});

      if (!window.FsbSkopeoCapabilityProjector ||
          typeof window.FsbSkopeoCapabilityProjector.validateProjection !== 'function' ||
          !window.FSBSkopeoContextRouter ||
          typeof window.FSBSkopeoContextRouter.createRouter !== 'function' ||
          !window.FSBSkopeoAppContextResolver ||
          typeof window.FSBSkopeoAppContextResolver.createResolver !== 'function' ||
          !window.FSBSkopeoAnchorRegistry ||
          typeof window.FSBSkopeoAnchorRegistry.createRegistry !== 'function' ||
          !window.FSBSkopeoAdapterRegistry ||
          typeof window.FSBSkopeoAdapterRegistry.resolve !== 'function' ||
          !window.FSBSkopeoAdaptiveComposer ||
          typeof window.FSBSkopeoAdaptiveComposer.compose !== 'function' ||
          !window.FSBSkopeoRendererRegistry ||
          typeof window.FSBSkopeoRendererRegistry.render !== 'function' ||
          !window.FSBSkopeoShell || typeof window.FSBSkopeoShell.createShell !== 'function') {
        terminateOwner('failed-start');
        return false;
      }

      try {
        state.router = window.FSBSkopeoContextRouter.createRouter({ generation: generation });
        state.shell = window.FSBSkopeoShell.createShell({
          document: document,
          window: window,
          generation: generation,
          signal: state.controller.signal,
          allowControlledFixture: true,
          fixtureToken: state.fixtureToken,
          onRequestClose: onShellClose,
          onRequestKill: onShellKill,
          onEscapeConsumed: onShellEscape,
          onAdaptiveAction: onAdaptiveAction,
          onCorpusAction: onCorpusAction,
          onContractWithdraw: onContractWithdraw
        });
        if (!ensureContextResolver()) throw new Error('adaptive context resolver unavailable');
        state.preparedPlacement = state.shell.prepareAmbient();
        const placement = state.shell.getPreparedPlacementMode(state.preparedPlacement);
        if (!state.preparedPlacement || (placement !== 'full' && placement !== 'compact')) {
          sendOutbound({ action: 'skopeo:kill-request', generation: generation, reason: 'unsafe-layout' });
          terminateOwner('unsafe-layout');
          return false;
        }
        if (!isLive(generation)) return false;
        state.phase = 'prepared';
        sendOutbound({ action: 'skopeo:prepared', generation: generation, placement: placement });
        return true;
      } catch (_error) {
        terminateOwner('failed-start');
        return false;
      }
    }

    function commit(envelope) {
      if (!isExactEnvelope(envelope, 'skopeo:commit') || state.disposed) return false;
      if (envelope.generation !== state.generation) return false;
      if (state.phase === 'active' && state.mounted) return true;
      if (state.phase !== 'prepared' || !state.shell || !state.preparedPlacement) return false;

      const generation = state.generation;
      const placement = state.preparedPlacement;
      state.preparedPlacement = null;
      let mounted = false;
      try {
        mounted = state.shell.mountAmbient(placement) === true;
      } catch (_error) {
        mounted = false;
      }
      if (!mounted || !isLive(generation)) {
        terminateOwner('failed-start');
        return false;
      }

      state.mounted = true;
      state.phase = 'active';
      state.attention = 'ambient';
      // mountAmbient installs the shell's trusted keyboard boundary first.
      // This bubble fallback runs only when that boundary did not consume the key.
      window.addEventListener('keydown', onKeydown, false);
      window.addEventListener('pagehide', onPagehide, false);
      state.activeListenersInstalled = true;
      bumpRuntimeResource('listeners', 2);
      if (!isLive(generation)) return false;
      const currentUrl = window.location && typeof window.location.href === 'string'
        ? window.location.href
        : '';
      if (!routeUntrustedUrl(currentUrl, 'context-changed')) {
        terminateOwner('failed-start');
        return false;
      }
      if (!isLive(generation)) return false;
      if (!resolveAdaptiveContext(currentUrl) || !composeAndRender('initial', null, null, [])) {
        terminateOwner('failed-start');
        return false;
      }
      const ready = adaptiveAuthorityResponse();
      if (!ready || !isLive(generation)) {
        terminateOwner('failed-start');
        return false;
      }
      sendOutbound({
        action: 'skopeo:ready',
        generation: generation,
        attention: ready.attention,
        exactOrigin: ready.exactOrigin,
        profileId: ready.profileId,
        profileVersion: ready.profileVersion,
        catalogVersion: ready.catalogVersion,
        contextEpoch: ready.contextEpoch,
        semanticEntity: ready.semanticEntity
      });
      refreshContractForCurrentContext();
      refreshCorpusForCurrentContext();
      return true;
    }

    function probe(envelope) {
      if (!isExactEnvelope(envelope, 'skopeo:probe')) return false;
      if (!state.disposed && state.phase === 'active' && state.mounted &&
          envelope.generation === state.generation) {
        const authority = adaptiveAuthorityResponse();
        if (!authority) return {
          success: false,
          generation: envelope.generation,
          status: 'stale',
          code: STALE_CODE
        };
        return {
          success: true,
          generation: envelope.generation,
          status: 'active',
          attention: state.attention,
          mounted: true,
          exactOrigin: authority.exactOrigin,
          profileId: authority.profileId,
          profileVersion: authority.profileVersion,
          catalogVersion: authority.catalogVersion,
          contextEpoch: authority.contextEpoch,
          semanticEntity: authority.semanticEntity
        };
      }
      return {
        success: false,
        generation: envelope.generation,
        status: 'stale',
        code: STALE_CODE
      };
    }

    function terminate(envelope) {
      if (!isExactEnvelope(envelope, 'skopeo:terminate')) return false;
      if (envelope.generation !== state.generation) return false;
      if (state.disposed) return state.finalSnapshot || false;
      return terminateOwner(envelope.reason.trim());
    }

    function activateControlledFixtureForTest() {
      if (!isLive(state.generation) || state.phase !== 'active' || !state.mounted) return false;
      if (window.__FSB_SKOPEO_TEST_FIXTURE__ !== true) return false;
      if (!state.shell || typeof state.shell.enableControlledFixture !== 'function') return false;
      if (state.fixtureActivated) return true;
      if (!state.shell.enableControlledFixture(state.fixtureToken)) return false;

      const generation = state.generation;
      state.fixtureActivated = true;
      const timerId = setTimeout(function () {
        if (state.fixtureTimerId === timerId) {
          state.fixtureTimerId = null;
          bumpRuntimeResource('timeouts', -1);
        }
        if (!isLive(generation) || !state.shell || typeof state.shell.render !== 'function') return;
        if (state.shell.render('anchored', { announcement: 'Skopeo controlled fixture ready.' })) {
          state.attention = 'anchored';
        }
      }, 25);
      state.fixtureTimerId = timerId;
      bumpRuntimeResource('timeouts', 1);
      return true;
    }

    function onKeydown(event) {
      // The shell owns trusted keyboard input. This later bubble listener is a
      // fail-closed fallback and can never turn a page-created event into HUD input.
      if (!event || event.defaultPrevented || event.key !== 'Escape' || event.repeat ||
          event.isComposing || event.isTrusted !== true) return;
      if (!isLive(state.generation) || !state.mounted || !state.shell) return;

      if (state.attention === 'interstitial' && state.pendingConsequence) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        Promise.resolve(finishConsequence(
          'skopeo:consequence-cancel', { restoreFocused: true }
        )).catch(function () {});
        return;
      }

      const now = window.performance && typeof window.performance.now === 'function'
        ? window.performance.now()
        : Date.now();
      if (state.lastEscapeAt !== null && now - state.lastEscapeAt <= DOUBLE_ESCAPE_MS) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        requestKill('escape');
        return;
      }

      const consumed = state.shell.back() === true;
      if (!consumed) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (!isLive(state.generation)) return;

      state.lastEscapeAt = now;
      if (typeof state.shell.getSnapshot === 'function') {
        const shellSnapshot = state.shell.getSnapshot();
        if (shellSnapshot && ACTIVE_ATTENTION.includes(shellSnapshot.attention)) {
          state.attention = shellSnapshot.attention;
        }
      }
    }

    function onPagehide() {
      requestKill('navigation');
    }

    function handleRouteChange(message) {
      if (!isExactRouteChange(message) || message.generation !== state.generation ||
          !isLive(state.generation) || state.phase !== 'active' || !state.mounted) {
        return false;
      }
      let parsed;
      try { parsed = new URL(message.url); } catch (_error) { parsed = null; }
      if (!parsed || !state.projection || parsed.origin !== state.projection.exactOrigin) {
        requestKill('navigation');
        return false;
      }
      withdrawContractProjection();
      withdrawCorpusProjection();
      state.actionEpoch += 1;
      state.pendingActionToken = null;
      state.pendingConsequence = null;
      state.pendingConsequenceAction = null;
      invalidatePendingArguments();
      if (!routeUntrustedUrl(message.url, 'navigation') ||
          !resolveAdaptiveContext(message.url) || !composeAndRender('initial', null, null, [])) {
        requestKill('navigation');
        return false;
      }
      refreshContractForCurrentContext();
      refreshCorpusForCurrentContext();
      return adaptiveAuthorityResponse();
    }

    function onRuntimeMessage(message, sender, sendResponse) {
      if (!sender || sender.id !== chrome.runtime.id) return false;
      let response = false;
      if (message && message.action === 'skopeo:configure') response = configure(message);
      else if (message && message.action === 'skopeo:prepare') response = prepare(message);
      else if (message && message.action === 'skopeo:commit') response = commit(message);
      else if (message && message.action === 'skopeo:probe') response = probe(message);
      else if (message && message.action === 'skopeo:terminate') response = terminate(message);
      else if (message && message.action === 'skopeo:route-change') response = handleRouteChange(message);
      if (typeof sendResponse === 'function') sendResponse(response);
      return false;
    }

    api.configure = configure;
    api.prepare = prepare;
    api.commit = commit;
    api.probe = probe;
    api.terminate = terminate;
    api.routeContext = function (input) { return routeContextInternal(input, 'context-changed'); };
    api.configureAnchorAdapter = configureAnchorAdapter;
    api.bindSemanticAnchor = bindSemanticAnchor;
    api.withdrawSemanticAnchor = withdrawSemanticAnchor;
    api.getSnapshot = function () { return state.finalSnapshot || currentSnapshot(); };
    api.activateControlledFixtureForTest = activateControlledFixtureForTest;
    api.disposeForReplacement = function () { return terminateOwner('replacement'); };

    window.__FSB_SKOPEO_RUNTIME__ = api;
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    state.runtimeListenerInstalled = true;
    bumpRuntimeResource('listeners', 1);
    return api;
  }

  const previous = window.__FSB_SKOPEO_RUNTIME__;
  if (previous && typeof previous.disposeForReplacement === 'function') {
    previous.disposeForReplacement();
  }
  installOwner();
})();
