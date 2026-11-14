(function(global) {
  'use strict';

  var VERSION = 'skopeo-graph-engine/v1';
  var MAX_SOURCES = 32;
  var SNAPSHOT_VERSION = 'skopeo-graph-exact-set/1';
  var MAX_SNAPSHOT_RECORDS = 4096;
  var MAX_SNAPSHOT_RELATIONS = 16384;
  var MAX_SNAPSHOT_EVIDENCE = 65536;
  var MAX_SNAPSHOT_BYTES = 8388608;

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function frozenArray(values) {
    return Object.freeze(values.slice());
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Reflect.ownKeys(value).forEach(function(key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && own(descriptor, 'value')) deepFreeze(descriptor.value, visited);
    });
    return Object.freeze(value);
  }

  function exactFields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var prototype;
    var keys;
    try {
      prototype = Object.getPrototypeOf(value);
      keys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if ((prototype !== Object.prototype && prototype !== null) || keys.length !== names.length) {
      return null;
    }
    var allowed = Object.create(null);
    names.forEach(function(name) { allowed[name] = true; });
    var output = Object.create(null);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch (_error2) { return null; }
      if (typeof key !== 'string' || !own(allowed, key) || !descriptor ||
          descriptor.enumerable !== true || !own(descriptor, 'value')) return null;
      output[key] = descriptor.value;
    }
    return output;
  }

  function dataValue(value, key) {
    if (!value || typeof value !== 'object') return undefined;
    var descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch (_error) { return undefined; }
    return descriptor && descriptor.enumerable === true && own(descriptor, 'value')
      ? descriptor.value : undefined;
  }

  function denseArray(value, maximum, minimum) {
    if (!Array.isArray(value)) return null;
    var keys;
    var lengthDescriptor;
    try {
      keys = Reflect.ownKeys(value);
      lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    } catch (_error) {
      return null;
    }
    if (!lengthDescriptor || !own(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < minimum ||
        lengthDescriptor.value > maximum || keys.length !== lengthDescriptor.value + 1) return null;
    var output = [];
    for (var index = 0; index < lengthDescriptor.value; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || descriptor.enumerable !== true || !own(descriptor, 'value')) return null;
      output.push(descriptor.value);
    }
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var key = keys[keyIndex];
      if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= lengthDescriptor.value)) return null;
    }
    return output;
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validGeneration(value) {
    return typeof value === 'string' && /^sfg1:[0-9a-f]{64}$/.test(value);
  }

  function validDigest(value, prefix) {
    return typeof value === 'string' &&
      new RegExp('^' + prefix + '[0-9a-f]{64}$').test(value);
  }

  function validSourceState(value) {
    return ['ready', 'pending', 'unreadable', 'download-blocked', 'inaccessible', 'missing']
      .indexOf(value) !== -1;
  }

  function compareText(left, right) {
    return left < right ? -1 : (left > right ? 1 : 0);
  }

  function encodeTuple(prefix, values) {
    var output = prefix;
    for (var index = 0; index < values.length; index += 1) {
      var value = String(values[index]);
      output += value.length + ':' + value;
    }
    return output;
  }

  function digestHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var output = '';
    for (var index = 0; index < bytes.length; index += 1) {
      output += bytes[index].toString(16).padStart(2, '0');
    }
    return output;
  }

  async function sha256Text(value) {
    var cryptoObject = global && global.crypto;
    var Encoder = global && global.TextEncoder;
    if (typeof value !== 'string' || !cryptoObject || !cryptoObject.subtle ||
        typeof cryptoObject.subtle.digest !== 'function' || typeof Encoder !== 'function') {
      return null;
    }
    try {
      var digest = await cryptoObject.subtle.digest('SHA-256', new Encoder().encode(value));
      var hex = digestHex(digest);
      return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
    } catch (_error) {
      return null;
    }
  }

  function utf8Length(value) {
    var Encoder = global && global.TextEncoder;
    if (typeof value !== 'string' || typeof Encoder !== 'function') return null;
    try {
      return new Encoder().encode(value).length;
    } catch (_error) {
      return null;
    }
  }

  function liveSignal(value) {
    return !!value && typeof value === 'object' && value.aborted === false &&
      typeof value.addEventListener === 'function' &&
      typeof value.removeEventListener === 'function';
  }

  function partitionKey(certificate) {
    var accountPermissionId = dataValue(certificate, 'accountPermissionId');
    var corpusRootFileId = dataValue(certificate, 'corpusRootFileId');
    if (!validId(accountPermissionId) || !validId(corpusRootFileId)) return null;
    return 'scpk1:' + accountPermissionId.length + ':' + accountPermissionId +
      corpusRootFileId.length + ':' + corpusRootFileId;
  }

  function certificateFingerprint(certificate) {
    var content = dataValue(certificate, 'contentFingerprint');
    if (validFingerprint(content)) return content;
    var value = dataValue(content, 'value');
    return validFingerprint(value) ? value : null;
  }

  function decision(value) {
    return frozenRecord([['decision', value]]);
  }

  function admittedValue(value) {
    return frozenRecord([['decision', 'admitted'], ['value', value]]);
  }

  function failureReason(value) {
    var status = dataValue(value, 'status');
    return typeof status === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(status)
      ? status : 'operation-failed';
  }

  function withheld(reason) {
    return admittedValue(frozenRecord([
      ['ok', false], ['status', 'withheld'], ['reason', failureReason({ status: reason })]
    ]));
  }

  function normalizeSourceInput(value) {
    var input = exactFields(value, ['sourceFileId']);
    return input && validId(input.sourceFileId) ? input : null;
  }

  function normalizeSelection(value) {
    var single = exactFields(value, ['sourceFileId']);
    if (single) {
      return validId(single.sourceFileId)
        ? { single: true, sourceFileIds: [single.sourceFileId] }
        : null;
    }
    var set = exactFields(value, ['sourceFileIds']);
    var values = set && denseArray(set.sourceFileIds, MAX_SOURCES, 1);
    if (!values || values.some(function(item) { return !validId(item); }) ||
        new Set(values).size !== values.length) return null;
    return { single: false, sourceFileIds: values.slice() };
  }

  function settingsBinding(settings) {
    var providerId = dataValue(settings, 'modelProvider');
    var modelId = dataValue(settings, 'modelName');
    if (typeof providerId !== 'string' || providerId.length < 1 || providerId.length > 128 ||
        typeof modelId !== 'string' || modelId.length < 1 || modelId.length > 128) return null;
    return frozenRecord([['providerId', providerId], ['modelId', modelId]]);
  }

  function create(options) {
    var fields = exactFields(options, [
      'graphSchema', 'graphStore', 'graphExtractor', 'graphQuery', 'corpusTransport',
      'runCorpusOperation', 'readSettings', 'providerFactory', 'now'
    ]);
    if (!fields || !fields.graphSchema || !fields.graphStore || !fields.graphExtractor ||
        !fields.graphQuery || !fields.corpusTransport ||
        typeof fields.corpusTransport.readContent !== 'function' ||
        typeof fields.runCorpusOperation !== 'function' ||
        typeof fields.readSettings !== 'function' || typeof fields.providerFactory !== 'function' ||
        typeof fields.now !== 'function') return null;
    var graphSchema = fields.graphSchema;
    var graphStore = fields.graphStore;
    var graphExtractor = fields.graphExtractor;
    var graphQuery = fields.graphQuery;
    var corpusTransport = fields.corpusTransport;
    var runCorpusOperation = fields.runCorpusOperation;
    var readSettings = fields.readSettings;
    var requiredStore = [
      'issueMutation', 'finishMutation', 'withdrawSource', 'withdrawSourceIfCurrent',
      'beginReplacement', 'stageBatch',
      'sealStaging', 'publishReplacement', 'replaceCandidateRelations',
      'readCurrentFragment', 'inspectMetadata'
    ];
    var requiredExtractor = [
      'prepareSource', 'verifyProviderBinding', 'nextBatch', 'repairBatch',
      'finalize', 'reuseKey', 'discard'
    ];
    var requiredQuery = [
      'createScope', 'ensureScopeCache', 'getById', 'searchLexical', 'neighbors',
      'inspectProvenance', 'snapshotExactSet', 'releaseScope'
    ];
    if (requiredStore.some(function(name) { return typeof graphStore[name] !== 'function'; }) ||
        requiredExtractor.some(function(name) { return typeof graphExtractor[name] !== 'function'; }) ||
        requiredQuery.some(function(name) { return typeof graphQuery[name] !== 'function'; }) ||
        typeof graphSchema.deriveFragmentGenerationId !== 'function' ||
        typeof graphSchema.parseCandidateRelationIntent !== 'function' ||
        typeof graphSchema.parseCandidateRelation !== 'function') return null;

    async function withMutation(effectGuard, work) {
      if (!effectGuard || effectGuard.signal === undefined ||
          typeof effectGuard.validate !== 'function' || !liveSignal(effectGuard.signal) ||
          !await effectGuard.validate()) throw new Error('stale-graph-effect');
      var mutationGuard = graphStore.issueMutation(effectGuard.signal);
      if (!mutationGuard) throw new Error('graph-mutation-unavailable');
      var output;
      var workError = null;
      try {
        output = await work(mutationGuard);
      } catch (error) {
        workError = error;
      }
      var terminal = graphStore.finishMutation(mutationGuard);
      if (!terminal || terminal.ok !== true) throw new Error('graph-mutation-unfinished');
      if (workError) throw workError;
      return output;
    }

    function acknowledgedEffect(effect) {
      return async function commitPrepared(prepared, publisher, operationSignal) {
        if (!publisher || publisher.signal !== operationSignal ||
            typeof publisher.publish !== 'function' || !liveSignal(operationSignal)) return null;
        return publisher.publish(async function graphEngineEffect(effectGuard) {
          if (!effectGuard || effectGuard.signal !== operationSignal ||
              typeof effectGuard.validate !== 'function' || !await effectGuard.validate()) {
            throw new Error('stale-graph-effect');
          }
          return effect(prepared, effectGuard);
        });
      };
    }

    function ProviderNoStorageResult(prepared) {
      return deepFreeze(frozenRecord([
        ['status', 'provider-no-storage'],
        ['durableEffect', false],
        ['prepared', prepared]
      ]));
    }

    async function providerCommit(prepared, publisher, operationSignal) {
      if (!publisher || operationSignal !== publisher.signal ||
          typeof publisher.publish !== 'function' || !liveSignal(operationSignal)) return null;
      return publisher.publish(async function providerNoStorageEffect(effectGuard) {
        if (!effectGuard || effectGuard.signal !== operationSignal ||
            typeof effectGuard.validate !== 'function' || !await effectGuard.validate()) {
          throw new Error('stale-provider-step');
        }
        return ProviderNoStorageResult(prepared);
      });
    }

    async function freshSettingsBinding() {
      try { return settingsBinding(await readSettings()); } catch (_error) { return null; }
    }

    function staleFragmentBinding(partition, sourceFileId, activeGenerationId, contentFingerprint) {
      if (!validGeneration(activeGenerationId) || !validFingerprint(contentFingerprint)) return null;
      return frozenRecord([
        ['status', 'stale-fragment-binding'],
        ['partitionKey', partition],
        ['sourceFileId', sourceFileId],
        ['activeGenerationId', activeGenerationId],
        ['contentFingerprint', contentFingerprint]
      ]);
    }

    function isStaleFragmentBinding(value) {
      return !!value && value.status === 'stale-fragment-binding' &&
        typeof value.partitionKey === 'string' && validId(value.sourceFileId) &&
        validGeneration(value.activeGenerationId) && validFingerprint(value.contentFingerprint);
    }

    async function certifiedFragment(certificate) {
      var sourceFileId = dataValue(certificate, 'sourceFileId');
      var ownedPartition = partitionKey(certificate);
      if (!validId(sourceFileId) || !ownedPartition) return null;
      var fingerprint = certificateFingerprint(certificate);
      var expectedGeneration = fingerprint && await graphSchema.deriveFragmentGenerationId({
        schemaVersion: graphSchema.VERSION,
        partitionKey: ownedPartition,
        sourceFileId: sourceFileId,
        contentFingerprint: fingerprint
      });
      var metadata = await graphStore.inspectMetadata(frozenRecord([
        ['partitionKey', ownedPartition], ['sourceFileId', sourceFileId]
      ]));
      if (!metadata) return null;
      if (metadata.state !== 'published') {
        return frozenRecord([
          ['status', 'not-published'], ['partitionKey', ownedPartition],
          ['sourceFileId', sourceFileId], ['metadata', metadata]
        ]);
      }
      if (!fingerprint || typeof expectedGeneration !== 'string' ||
          metadata.fragmentGenerationId !== expectedGeneration) {
        return staleFragmentBinding(
          ownedPartition, sourceFileId, metadata.activeGenerationId, metadata.contentFingerprint);
      }
      var fragment = await graphStore.readCurrentFragment(frozenRecord([
        ['partitionKey', ownedPartition], ['sourceFileId', sourceFileId],
        ['fragmentGenerationId', expectedGeneration]
      ]));
      if (!fragment || fragment.partitionKey !== ownedPartition ||
          fragment.sourceFileId !== sourceFileId ||
          fragment.contentFingerprint !== fingerprint ||
          fragment.fragmentGenerationId !== expectedGeneration) {
        return staleFragmentBinding(
          ownedPartition, sourceFileId, metadata.activeGenerationId, metadata.contentFingerprint);
      }
      return frozenRecord([
        ['status', 'current'], ['partitionKey', ownedPartition],
        ['sourceFileId', sourceFileId], ['metadata', metadata], ['fragment', fragment]
      ]);
    }

    async function fenceStaleWithinEffect(binding, effectGuard) {
      return withMutation(effectGuard, async function(mutationGuard) {
        var fenced = await graphStore.withdrawSourceIfCurrent(frozenRecord([
          ['partitionKey', binding.partitionKey], ['sourceFileId', binding.sourceFileId],
          ['activeGenerationId', binding.activeGenerationId],
          ['contentFingerprint', binding.contentFingerprint],
          ['reason', 'user-withdrawn']
        ]), mutationGuard);
        if (!fenced || (fenced.status !== 'withheld' && fenced.status !== 'superseded')) {
          return frozenRecord([
            ['status', 'stale-operation']
          ]);
        }
        return frozenRecord([['status', 'stale-operation']]);
      });
    }

    async function fenceStaleAfterRead(exactTuple, binding) {
      if (!isStaleFragmentBinding(binding)) return;
      await withdrawStaleWithPartition(exactTuple, binding);
    }

    function beginInput(session) {
      return frozenRecord([
        ['schemaVersion', graphSchema.VERSION],
        ['promptVersion', graphSchema.PROMPT_VERSION],
        ['partitionKey', session.partitionKey],
        ['sourceFileId', session.sourceFileId],
        ['contentFingerprint', session.contentFingerprint],
        ['providerId', session.providerId],
        ['modelId', session.modelId]
      ]);
    }

    async function checkReuse(exactTuple, sourceFileId) {
      var binding = await freshSettingsBinding();
      if (!binding) return decision('pending');
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        async function(certificate) {
          var key = await graphExtractor.reuseKey(
            certificate, binding.providerId, binding.modelId);
          if (typeof key !== 'string') return frozenRecord([
            ['status', 'replace'], ['reason', failureReason(key)]
          ]);
          var ownedPartition = partitionKey(certificate);
          var fingerprint = certificateFingerprint(certificate);
          var generationId = ownedPartition && fingerprint
            ? await graphSchema.deriveFragmentGenerationId({
              schemaVersion: graphSchema.VERSION,
              partitionKey: ownedPartition,
              sourceFileId: sourceFileId,
              contentFingerprint: fingerprint
            })
            : null;
          var fragment = generationId ? await graphStore.readCurrentFragment({
            partitionKey: ownedPartition,
            sourceFileId: sourceFileId,
            fragmentGenerationId: generationId
          }) : null;
          var reusable = !!fragment && fragment.schemaVersion === graphSchema.VERSION &&
            fragment.promptVersion === graphSchema.PROMPT_VERSION &&
            fragment.contentFingerprint === fingerprint &&
            fragment.providerId === binding.providerId && fragment.modelId === binding.modelId;
          return reusable
            ? frozenRecord([['ok', true], ['status', 'reused'], ['version', VERSION]])
            : frozenRecord([['status', 'replace'], ['reason', 'not-current']]);
        },
        acknowledgedEffect(function(prepared) { return prepared; })
      );
    }

    async function withdrawWithPartition(exactTuple, sourceFileId) {
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        async function(certificate) {
          var ownedPartition = partitionKey(certificate);
          return ownedPartition
            ? frozenRecord([['status', 'withdraw-ready'], ['partitionKey', ownedPartition]])
            : frozenRecord([['status', 'certificate-invalid']]);
        },
        acknowledgedEffect(function(prepared, effectGuard) {
          if (!prepared || prepared.status !== 'withdraw-ready') return prepared;
          return withMutation(effectGuard, function(mutationGuard) {
            return graphStore.withdrawSource(frozenRecord([
              ['partitionKey', prepared.partitionKey],
              ['sourceFileId', sourceFileId],
              ['reason', 'user-withdrawn']
            ]), mutationGuard);
          });
        })
      );
    }

    async function withdrawStaleWithPartition(exactTuple, binding) {
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', binding.sourceFileId]]),
        async function(certificate) {
          var ownedPartition = partitionKey(certificate);
          return ownedPartition === binding.partitionKey
            ? frozenRecord([
              ['status', 'stale-withdraw-ready'],
              ['partitionKey', binding.partitionKey],
              ['sourceFileId', binding.sourceFileId],
              ['activeGenerationId', binding.activeGenerationId],
              ['contentFingerprint', binding.contentFingerprint]
            ])
            : frozenRecord([['status', 'certificate-invalid']]);
        },
        acknowledgedEffect(function(prepared, effectGuard) {
          if (!prepared || prepared.status !== 'stale-withdraw-ready') return prepared;
          return withMutation(effectGuard, function(mutationGuard) {
            return graphStore.withdrawSourceIfCurrent(frozenRecord([
              ['partitionKey', prepared.partitionKey],
              ['sourceFileId', prepared.sourceFileId],
              ['activeGenerationId', prepared.activeGenerationId],
              ['contentFingerprint', prepared.contentFingerprint],
              ['reason', 'user-withdrawn']
            ]), mutationGuard);
          });
        })
      );
    }

    function readCertificateMimeType(certificate) {
      var metadata = dataValue(certificate, 'metadataFingerprint');
      var mimeType = dataValue(metadata, 'mimeType');
      return typeof mimeType === 'string' ? mimeType : null;
    }

    async function prepare(exactTuple, sourceFileId) {
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        function(certificate, operationSignal) {
          return graphExtractor.prepareSource(
            certificate,
            operationSignal,
            function(operationSink, sinkSignal) {
              var input = frozenRecord([
                ['fileId', sourceFileId], ['mimeType', readCertificateMimeType(certificate)]
              ]);
              return corpusTransport.readContent.length >= 4
                ? corpusTransport.readContent(exactTuple, input, operationSink, sinkSignal)
                : corpusTransport.readContent(input, operationSink, sinkSignal);
            }
          );
        },
        acknowledgedEffect(function(preparedValue) { return preparedValue; })
      );
    }

    async function openStaging(exactTuple, sourceFileId, session) {
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        function(certificate, operationSignal) {
          return graphExtractor.verifyProviderBinding(session, certificate, operationSignal);
        },
        acknowledgedEffect(function(verification, effectGuard) {
          if (!verification || verification.status !== 'provider-binding-current') return verification;
          return withMutation(effectGuard, function(mutationGuard) {
            return graphStore.beginReplacement(beginInput(session), mutationGuard);
          });
        })
      );
    }

    async function providerStep(exactTuple, sourceFileId, session, repairFailure) {
      var result = await runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        function(certificate, operationSignal) {
          return repairFailure
            ? graphExtractor.repairBatch(session, certificate, repairFailure, operationSignal)
            : graphExtractor.nextBatch(session, certificate, operationSignal);
        },
        providerCommit
      );
      if (!result || result.decision !== 'admitted') return { authority: result || decision('closed') };
      var envelope = exactFields(result.value, ['status', 'durableEffect', 'prepared']);
      if (!envelope || envelope.status !== 'provider-no-storage' ||
          envelope.durableEffect !== false || !Object.isFrozen(result.value)) {
        return { authority: decision('closed') };
      }
      var prepared = envelope.prepared;
      var stripped = prepared && prepared.status === 'complete'
        ? { complete: true }
        : {
          outcome: prepared && prepared.status === 'provider-step'
            ? prepared.outcome : prepared
        };
      prepared = null;
      envelope = null;
      result = null;
      return stripped;
    }

    async function stage(exactTuple, sourceFileId, session, handle, batch) {
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        function(certificate, operationSignal) {
          return graphExtractor.verifyProviderBinding(session, certificate, operationSignal);
        },
        acknowledgedEffect(function(verification, effectGuard) {
          if (!verification || verification.status !== 'provider-binding-current') return verification;
          return withMutation(effectGuard, function(mutationGuard) {
            return graphStore.stageBatch(handle, batch, mutationGuard);
          });
        })
      );
    }

    async function finalize(exactTuple, sourceFileId, session, handle) {
      return runCorpusOperation(
        'ingestion', exactTuple, frozenRecord([['sourceFileId', sourceFileId]]),
        function(certificate, operationSignal) {
          return graphExtractor.finalize(session, certificate, operationSignal);
        },
        acknowledgedEffect(async function(payload, effectGuard) {
          if (!payload || !payload.fragment || !Array.isArray(payload.lexicalShards) ||
              !Array.isArray(payload.adjacencyShards) ||
              !Array.isArray(payload.resultCacheShards)) return payload;
          return withMutation(effectGuard, async function(mutationGuard) {
            var sealed = await graphStore.sealStaging(handle, payload, mutationGuard);
            if (!sealed || sealed.status !== 'sealed') return sealed;
            return graphStore.publishReplacement(handle, mutationGuard);
          });
        })
      );
    }

    async function replaceSource(exactTuple, sourceInput) {
      var input = normalizeSourceInput(sourceInput);
      if (!input) return decision('closed');
      var reuse = await checkReuse(exactTuple, input.sourceFileId);
      if (!reuse || reuse.decision !== 'admitted') return reuse || decision('closed');
      if (reuse.value && reuse.value.status === 'reused') return reuse;
      var withdrawn = await withdrawWithPartition(exactTuple, input.sourceFileId);
      if (!withdrawn || withdrawn.decision !== 'admitted' ||
          !withdrawn.value || withdrawn.value.status !== 'withheld') {
        return withdrawn || decision('closed');
      }
      var prepared = await prepare(exactTuple, input.sourceFileId);
      if (!prepared || prepared.decision !== 'admitted' || !prepared.value ||
          !prepared.value.session || !prepared.value.providerBinding) {
        return prepared && prepared.decision !== 'admitted'
          ? prepared : withheld(failureReason(prepared && prepared.value));
      }
      var session = prepared.value.session;
      var opened;
      try {
        opened = await openStaging(exactTuple, input.sourceFileId, session);
        if (!opened || opened.decision !== 'admitted' || !opened.value ||
            opened.value.status !== 'staging') {
          return opened && opened.decision !== 'admitted'
            ? opened : withheld(failureReason(opened && opened.value));
        }
        var handle = opened.value;
        for (var callIndex = 0; callIndex <= 8; callIndex += 1) {
          var step = await providerStep(exactTuple, input.sourceFileId, session, null);
          if (step.authority) return step.authority;
          if (step.complete === true) break;
          var outcome = step.outcome;
          step = null;
          if (outcome && outcome.status !== 'validated-batch' && outcome.repairable === true) {
            var repair = await providerStep(exactTuple, input.sourceFileId, session, outcome);
            if (repair.authority) return repair.authority;
            outcome = repair.outcome;
            repair = null;
          }
          if (!outcome || outcome.status !== 'validated-batch' || !outcome.batch) {
            return withheld(failureReason(outcome));
          }
          var batch = outcome.batch;
          outcome = null;
          var staged = await stage(exactTuple, input.sourceFileId, session, handle, batch);
          batch = null;
          if (!staged || staged.decision !== 'admitted' || !staged.value ||
              staged.value.status !== 'staged') {
            return staged && staged.decision !== 'admitted'
              ? staged : withheld(failureReason(staged && staged.value));
          }
          if (callIndex === 8) return withheld('budget-exceeded');
        }
        var published = await finalize(exactTuple, input.sourceFileId, session, handle);
        if (!published || published.decision !== 'admitted' || !published.value ||
            published.value.status !== 'published') {
          return published && published.decision !== 'admitted'
            ? published : withheld(failureReason(published && published.value));
        }
        return published;
      } finally {
        graphExtractor.discard(session);
      }
    }

    function relationKindsAllowed(kind, fromKind, toKind) {
      if (kind === 'amends-candidate') {
        return fromKind === 'amendment' && (toKind === 'agreement' || toKind === 'clause');
      }
      if (kind === 'references-policy') return toKind === 'policy-document';
      if (kind === 'references-memo') return toKind === 'memo';
      return false;
    }

    async function currentFragments(certificates) {
      var bySource = new Map();
      var ownedPartition = null;
      for (var index = 0; index < certificates.length; index += 1) {
        var current = await certifiedFragment(certificates[index]);
        if (isStaleFragmentBinding(current)) return current;
        if (!current || current.status !== 'current' ||
            (ownedPartition !== null && ownedPartition !== current.partitionKey)) return null;
        ownedPartition = current.partitionKey;
        bySource.set(current.sourceFileId, current.fragment);
      }
      return { partitionKey: ownedPartition, bySource: bySource };
    }

    function exactCertificateSet(certificatesValue, proof, sourceFileIds) {
      var certificates = denseArray(certificatesValue, MAX_SOURCES, 1);
      var proofFields = exactFields(proof, ['complete']);
      if (!certificates || !proofFields || proofFields.complete !== true ||
          certificates.length !== sourceFileIds.length) return null;
      var expected = new Set(sourceFileIds);
      var bySource = new Map();
      for (var index = 0; index < certificates.length; index += 1) {
        var sourceFileId = dataValue(certificates[index], 'sourceFileId');
        var sourceState = dataValue(certificates[index], 'sourceState');
        if (!validId(sourceFileId) || !expected.has(sourceFileId) ||
            !validSourceState(sourceState) || bySource.has(sourceFileId)) return null;
        bySource.set(sourceFileId, {
          certificate: certificates[index],
          sourceFileId: sourceFileId,
          sourceState: sourceState
        });
      }
      if (bySource.size !== sourceFileIds.length) return null;
      return sourceFileIds.map(function(sourceFileId) { return bySource.get(sourceFileId); });
    }

    function sourceBlocker(certificateSet) {
      var unavailable = certificateSet.some(function(item) {
        return item.sourceState === 'pending' || item.sourceState === 'inaccessible' ||
          item.sourceState === 'missing';
      });
      var bindings = certificateSet.map(function(item) {
        return frozenRecord([
          ['sourceFileId', item.sourceFileId],
          ['sourceState', item.sourceState],
          ['certificationStatus', 'certified'],
          ['graphCurrent', false]
        ]);
      });
      return frozenRecord([
        ['status', 'blocked'],
        ['reason', unavailable ? 'source-unavailable' : 'source-unreadable'],
        ['sourceBindings', frozenArray(bindings)]
      ]);
    }

    function snapshotEvidenceValid(
      value, binding, partition, entityKind, entityVersionId, counter, identities
    ) {
      var inputs = denseArray(value, 64, 1);
      if (!inputs || !binding) return false;
      var priorLocatorId = null;
      for (var index = 0; index < inputs.length; index += 1) {
        var locator = exactFields(inputs[index], [
          'partitionKey', 'sourceFileId', 'contentFingerprint', 'fragmentGenerationId',
          'locatorId', 'sourceByteStart', 'sourceByteEnd'
        ]);
        if (!locator || locator.partitionKey !== partition ||
            locator.sourceFileId !== binding.sourceFileId ||
            locator.contentFingerprint !== binding.contentFingerprint ||
            locator.fragmentGenerationId !== binding.fragmentGenerationId ||
            !validDigest(locator.locatorId, 'sel1:') ||
            !Number.isSafeInteger(locator.sourceByteStart) || locator.sourceByteStart < 0 ||
            !Number.isSafeInteger(locator.sourceByteEnd) ||
            locator.sourceByteEnd <= locator.sourceByteStart ||
            (priorLocatorId !== null && compareText(priorLocatorId, locator.locatorId) >= 0)) {
          return false;
        }
        priorLocatorId = locator.locatorId;
        counter.count += 1;
        if (counter.count > MAX_SNAPSHOT_EVIDENCE) return false;
        identities.push(encodeTuple('snapshot-evidence|', [
          entityKind,
          entityVersionId,
          locator.partitionKey,
          locator.sourceFileId,
          locator.contentFingerprint,
          locator.fragmentGenerationId,
          locator.locatorId,
          String(locator.sourceByteStart),
          String(locator.sourceByteEnd)
        ]));
      }
      return true;
    }

    function validateQuerySnapshot(value, current, sourceFileIds) {
      var snapshot = exactFields(value, [
        'snapshotVersion', 'partitionKey', 'sourceBindings', 'records', 'relations'
      ]);
      var bindingInputs = snapshot && denseArray(snapshot.sourceBindings, MAX_SOURCES, 1);
      var recordInputs = snapshot && denseArray(snapshot.records, MAX_SNAPSHOT_RECORDS, 0);
      var relationInputs = snapshot && denseArray(
        snapshot.relations, MAX_SNAPSHOT_RELATIONS, 0);
      if (!snapshot || snapshot.snapshotVersion !== SNAPSHOT_VERSION ||
          snapshot.partitionKey !== current.partitionKey || !bindingInputs ||
          !recordInputs || !relationInputs || bindingInputs.length !== sourceFileIds.length) {
        return null;
      }
      var serialized;
      try { serialized = JSON.stringify(value); } catch (_error) { return null; }
      var serializedBytes = utf8Length(serialized);
      if (!Number.isSafeInteger(serializedBytes) || serializedBytes < 0 ||
          serializedBytes > MAX_SNAPSHOT_BYTES) return null;

      var bindings = new Map();
      for (var bindingIndex = 0; bindingIndex < bindingInputs.length; bindingIndex += 1) {
        var binding = exactFields(bindingInputs[bindingIndex], [
          'sourceFileId', 'contentFingerprint', 'fragmentGenerationId'
        ]);
        var expectedSourceFileId = sourceFileIds[bindingIndex];
        var fragment = binding && current.bySource.get(binding.sourceFileId);
        if (!binding || binding.sourceFileId !== expectedSourceFileId ||
            !validFingerprint(binding.contentFingerprint) ||
            !validGeneration(binding.fragmentGenerationId) || !fragment ||
            fragment.partitionKey !== current.partitionKey ||
            fragment.sourceFileId !== binding.sourceFileId ||
            fragment.contentFingerprint !== binding.contentFingerprint ||
            fragment.fragmentGenerationId !== binding.fragmentGenerationId ||
            bindings.has(binding.sourceFileId)) return null;
        bindings.set(binding.sourceFileId, binding);
      }

      var recordKinds = Array.isArray(graphSchema.RECORD_KINDS)
        ? new Set(graphSchema.RECORD_KINDS) : null;
      var predicates = Array.isArray(graphSchema.RELATION_PREDICATES)
        ? new Set(graphSchema.RELATION_PREDICATES) : null;
      if (!recordKinds || !predicates) return null;
      var records = new Map();
      var recordVersions = new Set();
      var evidenceCounter = { count: 0 };
      var evidenceIdentities = [];
      var priorRecordVersionId = null;
      for (var recordIndex = 0; recordIndex < recordInputs.length; recordIndex += 1) {
        var record = exactFields(recordInputs[recordIndex], [
          'partitionKey', 'sourceFileId', 'contentFingerprint', 'fragmentGenerationId',
          'kind', 'label', 'evidence', 'stableRecordId', 'recordVersionId'
        ]);
        var recordBinding = record && bindings.get(record.sourceFileId);
        if (!record || record.partitionKey !== current.partitionKey || !recordBinding ||
            record.contentFingerprint !== recordBinding.contentFingerprint ||
            record.fragmentGenerationId !== recordBinding.fragmentGenerationId ||
            !recordKinds.has(record.kind) || typeof record.label !== 'string' ||
            record.label.length < 1 || record.label.length > 4096 ||
            !validDigest(record.stableRecordId, 'sri1:') ||
            !validDigest(record.recordVersionId, 'srv1:') ||
            records.has(record.stableRecordId) || recordVersions.has(record.recordVersionId) ||
            (priorRecordVersionId !== null &&
              compareText(priorRecordVersionId, record.recordVersionId) >= 0) ||
            !snapshotEvidenceValid(
              record.evidence, recordBinding, current.partitionKey, 'record',
              record.recordVersionId, evidenceCounter, evidenceIdentities)) {
          return null;
        }
        priorRecordVersionId = record.recordVersionId;
        records.set(record.stableRecordId, record);
        recordVersions.add(record.recordVersionId);
      }

      var relationVersions = new Set();
      var priorRelationVersionId = null;
      for (var relationIndex = 0; relationIndex < relationInputs.length; relationIndex += 1) {
        var relation = exactFields(relationInputs[relationIndex], [
          'relationClass', 'partitionKey', 'sourceFileId', 'contentFingerprint',
          'fragmentGenerationId', 'predicate',
          'fromSourceFileId', 'fromFragmentGenerationId',
          'fromStableRecordId', 'fromRecordVersionId',
          'toSourceFileId', 'toFragmentGenerationId',
          'toStableRecordId', 'toRecordVersionId',
          'evidence', 'stableRelationId', 'relationVersionId', 'candidateOnly'
        ]);
        var relationBinding = relation && bindings.get(relation.sourceFileId);
        var from = relation && records.get(relation.fromStableRecordId);
        var to = relation && records.get(relation.toStableRecordId);
        var candidate = relation && relation.relationClass === 'cross-document-candidate';
        if (!relation || relation.partitionKey !== current.partitionKey || !relationBinding ||
            relation.contentFingerprint !== relationBinding.contentFingerprint ||
            relation.fragmentGenerationId !== relationBinding.fragmentGenerationId ||
            !predicates.has(relation.predicate) || !from || !to ||
            relation.fromSourceFileId !== from.sourceFileId ||
            relation.fromFragmentGenerationId !== from.fragmentGenerationId ||
            relation.fromRecordVersionId !== from.recordVersionId ||
            relation.toSourceFileId !== to.sourceFileId ||
            relation.toFragmentGenerationId !== to.fragmentGenerationId ||
            relation.toRecordVersionId !== to.recordVersionId ||
            !validDigest(relation.stableRelationId, 'srl1:') ||
            !(candidate
              ? validDigest(relation.relationVersionId, 'scv1:')
              : validDigest(relation.relationVersionId, 'slv1:')) ||
            relation.candidateOnly !== candidate ||
            (!candidate && relation.relationClass !== 'local') ||
            (candidate && (relation.sourceFileId !== from.sourceFileId ||
              from.sourceFileId === to.sourceFileId)) ||
            (!candidate && (relation.sourceFileId !== from.sourceFileId ||
              relation.sourceFileId !== to.sourceFileId)) ||
            relationVersions.has(relation.relationVersionId) ||
            (priorRelationVersionId !== null &&
              compareText(priorRelationVersionId, relation.relationVersionId) >= 0) ||
            !snapshotEvidenceValid(
              relation.evidence, relationBinding, current.partitionKey, 'relation',
              relation.relationVersionId, evidenceCounter, evidenceIdentities)) {
          return null;
        }
        priorRelationVersionId = relation.relationVersionId;
        relationVersions.add(relation.relationVersionId);
      }
      evidenceIdentities.sort(compareText);
      return {
        snapshot: snapshot,
        evidenceIdentities: evidenceIdentities,
        recordVersionIds: Array.from(recordVersions).sort(compareText),
        relationVersionIds: Array.from(relationVersions).sort(compareText)
      };
    }

    function currentBindings(certificateSet, current) {
      return frozenArray(certificateSet.map(function(item) {
        var fragment = current.bySource.get(item.sourceFileId);
        return frozenRecord([
          ['sourceFileId', item.sourceFileId],
          ['sourceState', item.sourceState],
          ['certificationStatus', 'certified'],
          ['graphCurrent', true],
          ['contentFingerprint', fragment.contentFingerprint],
          ['fragmentGenerationId', fragment.fragmentGenerationId]
        ]);
      }));
    }

    async function authorizedSetDigest(validated, bindings) {
      var values = [
        SNAPSHOT_VERSION,
        validated.snapshot.partitionKey,
        String(bindings.length),
        String(validated.recordVersionIds.length),
        String(validated.relationVersionIds.length),
        String(validated.evidenceIdentities.length)
      ];
      bindings.forEach(function(binding) {
        values.push(encodeTuple('authorized-source|', [
          binding.sourceFileId,
          binding.sourceState,
          binding.certificationStatus,
          binding.graphCurrent ? 'current' : 'stale',
          binding.contentFingerprint,
          binding.fragmentGenerationId
        ]));
      });
      validated.recordVersionIds.forEach(function(value) {
        values.push(encodeTuple('authorized-record|', [value]));
      });
      validated.relationVersionIds.forEach(function(value) {
        values.push(encodeTuple('authorized-relation|', [value]));
      });
      validated.evidenceIdentities.forEach(function(value) { values.push(value); });
      var hex = await sha256Text(encodeTuple('authorized-graph-exact-set|', values));
      return hex ? 'sgx1:' + hex : null;
    }

    async function currentFragmentsMatch(before, certificates, sourceFileIds) {
      var after = await currentFragments(certificates);
      if (!after || isStaleFragmentBinding(after) ||
          after.partitionKey !== before.partitionKey ||
          after.bySource.size !== sourceFileIds.length) return false;
      for (var index = 0; index < sourceFileIds.length; index += 1) {
        var sourceFileId = sourceFileIds[index];
        var prior = before.bySource.get(sourceFileId);
        var current = after.bySource.get(sourceFileId);
        if (!prior || !current ||
            prior.contentFingerprint !== current.contentFingerprint ||
            prior.fragmentGenerationId !== current.fragmentGenerationId) return false;
      }
      return true;
    }

    function evidenceForIntent(fromRecord, locatorIds) {
      var byId = new Map();
      if (!fromRecord || !Array.isArray(fromRecord.evidence)) return null;
      fromRecord.evidence.forEach(function(locator) { byId.set(locator.locatorId, locator); });
      var output = [];
      for (var index = 0; index < locatorIds.length; index += 1) {
        var locator = byId.get(locatorIds[index]);
        if (!locator) return null;
        output.push(locator);
      }
      return frozenArray(output);
    }

    async function prepareCandidateReplacement(certificates, proposerId, intents) {
      var current = await currentFragments(certificates);
      if (isStaleFragmentBinding(current)) return current;
      var proposer = current && current.bySource.get(proposerId);
      if (!current || !proposer) return null;
      var proposerRecords = new Map(proposer.records.map(function(record) {
        return [record.stableRecordId, record];
      }));
      var relations = [];
      var targetIds = new Set();
      var relationIds = new Set();
      for (var index = 0; index < intents.length; index += 1) {
        var intent = intents[index];
        if (intent.partitionKey !== current.partitionKey ||
            intent.proposingSourceFileId !== proposerId) return null;
        var target = current.bySource.get(intent.targetSourceFileId);
        if (!target) return null;
        var targetRecords = new Map(target.records.map(function(record) {
          return [record.stableRecordId, record];
        }));
        var from = proposerRecords.get(intent.fromStableRecordId);
        var to = targetRecords.get(intent.toStableRecordId);
        var evidence = evidenceForIntent(from, intent.evidenceLocatorIds);
        if (!from || !to || !evidence ||
            !relationKindsAllowed(intent.relationKind, from.kind, to.kind)) return null;
        var stableRelationId = await graphSchema.deriveStableRelationId({
          identityVersion: graphSchema.IDENTITY_VERSION,
          partitionKey: current.partitionKey,
          sourceFileId: proposerId,
          predicate: intent.relationKind,
          fromStableRecordId: from.stableRecordId,
          toStableRecordId: to.stableRecordId,
          primaryLocator: {
            sourceByteStart: evidence[0].sourceByteStart,
            sourceByteEnd: evidence[0].sourceByteEnd
          }
        });
        var evidenceIdentity = graphSchema.canonicalize(evidence.map(function(locator) {
          return {
            locatorId: locator.locatorId,
            sourceByteStart: locator.sourceByteStart,
            sourceByteEnd: locator.sourceByteEnd
          };
        }));
        var relationVersionId = stableRelationId && await graphSchema.deriveRelationVersionId({
          relationClass: 'cross-document-candidate',
          partitionKey: current.partitionKey,
          relationKind: intent.relationKind,
          stableRelationId: stableRelationId,
          proposerRecordVersionId: from.recordVersionId,
          proposerFragmentGenerationId: proposer.fragmentGenerationId,
          targetRecordVersionId: to.recordVersionId,
          targetFragmentGenerationId: target.fragmentGenerationId,
          canonicalEvidenceLocatorIdentity: evidenceIdentity
        });
        var relation = relationVersionId && await graphSchema.parseCandidateRelation({
          schemaVersion: graphSchema.VERSION,
          relationClass: 'cross-document-candidate',
          partitionKey: current.partitionKey,
          relationKind: intent.relationKind,
          proposingSourceFileId: proposerId,
          targetSourceFileId: target.sourceFileId,
          fromStableRecordId: from.stableRecordId,
          toStableRecordId: to.stableRecordId,
          stableRelationId: stableRelationId,
          proposerRecordVersionId: from.recordVersionId,
          proposerFragmentGenerationId: proposer.fragmentGenerationId,
          targetRecordVersionId: to.recordVersionId,
          targetFragmentGenerationId: target.fragmentGenerationId,
          evidence: evidence,
          canonicalEvidenceLocatorIdentity: evidenceIdentity,
          relationVersionId: relationVersionId
        });
        if (!relation || relationIds.has(relation.relationVersionId)) return null;
        relationIds.add(relation.relationVersionId);
        targetIds.add(target.sourceFileId);
        relations.push(relation);
      }
      relations.sort(function(left, right) {
        return left.relationVersionId.localeCompare(right.relationVersionId);
      });
      var targetGenerations = Array.from(targetIds).sort().map(function(sourceFileId) {
        return frozenRecord([
          ['sourceFileId', sourceFileId],
          ['fragmentGenerationId', current.bySource.get(sourceFileId).fragmentGenerationId]
        ]);
      });
      var overlayGenerationId = await graphSchema.deriveCandidateOverlayGenerationId({
        schemaVersion: graphSchema.VERSION,
        partitionKey: current.partitionKey,
        proposingSourceFileId: proposerId,
        proposingFragmentGenerationId: proposer.fragmentGenerationId,
        relations: relations
      });
      if (!overlayGenerationId) return null;
      return frozenRecord([
        ['schemaVersion', graphSchema.VERSION],
        ['partitionKey', current.partitionKey],
        ['proposingSourceFileId', proposerId],
        ['proposingFragmentGenerationId', proposer.fragmentGenerationId],
        ['targetGenerations', frozenArray(targetGenerations)],
        ['relations', frozenArray(relations)],
        ['overlayGenerationId', overlayGenerationId]
      ]);
    }

    async function replaceCandidateRelations(exactTuple, sourceSelection, value) {
      var input = exactFields(value, ['proposingSourceFileId', 'relations']);
      var relationInputs = input && denseArray(
        input.relations, graphSchema.LIMITS.MAX_RELATIONS, 0);
      if (!input || !validId(input.proposingSourceFileId) || !relationInputs) {
        return decision('closed');
      }
      var normalized = normalizeSelection(sourceSelection);
      if (!normalized) return decision('closed');
      if (relationInputs.length === 0) {
        if (!normalized.single || normalized.sourceFileIds[0] !== input.proposingSourceFileId) {
          return decision('closed');
        }
        return runCorpusOperation(
          'ingestion', exactTuple, sourceSelection,
          async function(certificate) {
            var current = await certifiedFragment(certificate);
            if (isStaleFragmentBinding(current)) return current;
            if (!current || current.status !== 'current' ||
                current.sourceFileId !== input.proposingSourceFileId) {
              return frozenRecord([['status', 'stale-operation']]);
            }
            return frozenRecord([
              ['schemaVersion', graphSchema.VERSION],
              ['partitionKey', current.partitionKey],
              ['proposingSourceFileId', input.proposingSourceFileId],
              ['proposingFragmentGenerationId', current.fragment.fragmentGenerationId],
              ['targetGenerations', frozenArray([])],
              ['relations', frozenArray([])]
            ]);
          },
          acknowledgedEffect(function(prepared, effectGuard) {
            if (isStaleFragmentBinding(prepared)) {
              return fenceStaleWithinEffect(prepared, effectGuard);
            }
            if (!prepared || prepared.status) return prepared;
            return withMutation(effectGuard, function(mutationGuard) {
              return graphStore.replaceCandidateRelations(prepared, mutationGuard);
            });
          })
        );
      }
      if (normalized.single || normalized.sourceFileIds.length < 2) return decision('closed');
      var intents = [];
      var expectedSources = new Set([input.proposingSourceFileId]);
      for (var relationIndex = 0; relationIndex < relationInputs.length; relationIndex += 1) {
        var intent = graphSchema.parseCandidateRelationIntent(relationInputs[relationIndex]);
        if (!intent || intent.proposingSourceFileId !== input.proposingSourceFileId) {
          return decision('closed');
        }
        intents.push(intent);
        expectedSources.add(intent.targetSourceFileId);
      }
      if (expectedSources.size !== normalized.sourceFileIds.length ||
          normalized.sourceFileIds.some(function(sourceFileId) {
            return !expectedSources.has(sourceFileId);
          })) return decision('closed');
      return runCorpusOperation(
        'ingestion', exactTuple, sourceSelection,
        async function(certificates, proof) {
          if (!proof || proof.complete !== true || certificates.length !== expectedSources.size) {
            return frozenRecord([['status', 'stale-operation']]);
          }
          var prepared = await prepareCandidateReplacement(
            certificates, input.proposingSourceFileId, intents);
          return prepared || frozenRecord([['status', 'candidate-invalid']]);
        },
        acknowledgedEffect(function(prepared, effectGuard) {
          if (isStaleFragmentBinding(prepared)) {
            return fenceStaleWithinEffect(prepared, effectGuard);
          }
          if (!prepared || prepared.status) return prepared;
          return withMutation(effectGuard, function(mutationGuard) {
            return graphStore.replaceCandidateRelations(prepared, mutationGuard);
          });
        })
      );
    }

    async function queryOperation(kind, method, exactTuple, sourceSelection, input) {
      var selection = normalizeSelection(sourceSelection);
      if (!selection) return decision('closed');
      var result = await runCorpusOperation(kind, exactTuple, sourceSelection, async function() {
        var args = Array.prototype.slice.call(arguments);
        var certificates = Array.isArray(args[0]) ? args[0] : [args[0]];
        var current = await currentFragments(certificates);
        if (isStaleFragmentBinding(current)) return current;
        if (!current || current.bySource.size !== selection.sourceFileIds.length) return null;
        var pairs = selection.sourceFileIds.map(function(sourceFileId) {
          var fragment = current.bySource.get(sourceFileId);
          return frozenRecord([
            ['sourceFileId', sourceFileId],
            ['fragmentGenerationId', fragment.fragmentGenerationId]
          ]);
        });
        var scope = graphQuery.createScope(frozenRecord([
          ['partitionKey', current.partitionKey],
          ['exactSourceGenerations', frozenArray(pairs)]
        ]));
        if (!scope) return null;
        try {
          var ready = await graphQuery.ensureScopeCache(scope);
          if (!ready || ready.status !== 'ready') return null;
          return await graphQuery[method](scope, input);
        } finally {
          graphQuery.releaseScope(scope);
        }
      });
      if (result && result.decision === 'admitted' &&
          isStaleFragmentBinding(result.value)) {
        await fenceStaleAfterRead(exactTuple, result.value);
        return decision('closed');
      }
      return result;
    }

    async function snapshotExactSet(exactTuple, sourceSelection) {
      var selection = normalizeSelection(sourceSelection);
      if (!selection || selection.single) return decision('closed');
      var sourceFileIds = selection.sourceFileIds.slice().sort(compareText);
      var canonicalSelection = frozenRecord([
        ['sourceFileIds', frozenArray(sourceFileIds)]
      ]);
      var result;
      try {
        result = await runCorpusOperation(
          'query', exactTuple, canonicalSelection,
          async function(certificates, proof, operationSignal) {
            if (!liveSignal(operationSignal)) return null;
            var certificateSet = exactCertificateSet(certificates, proof, sourceFileIds);
            if (!certificateSet) return null;
            if (certificateSet.some(function(item) { return item.sourceState !== 'ready'; })) {
              return sourceBlocker(certificateSet);
            }
            var certificateValues = certificateSet.map(function(item) {
              return item.certificate;
            });
            var current = await currentFragments(certificateValues);
            if (!current || isStaleFragmentBinding(current) ||
                current.bySource.size !== sourceFileIds.length) return null;
            var pairs = sourceFileIds.map(function(sourceFileId) {
              var fragment = current.bySource.get(sourceFileId);
              return fragment ? frozenRecord([
                ['sourceFileId', sourceFileId],
                ['fragmentGenerationId', fragment.fragmentGenerationId]
              ]) : null;
            });
            if (pairs.some(function(pair) { return pair === null; })) return null;
            var scope = graphQuery.createScope(frozenRecord([
              ['partitionKey', current.partitionKey],
              ['exactSourceGenerations', frozenArray(pairs)]
            ]));
            if (!scope) return null;
            try {
              var ready = await graphQuery.ensureScopeCache(scope);
              if (!ready || ready.status !== 'ready') return null;
              var querySnapshot = await graphQuery.snapshotExactSet(scope);
              var validated = validateQuerySnapshot(querySnapshot, current, sourceFileIds);
              if (!validated) return null;
              var bindings = currentBindings(certificateSet, current);
              var digest = await authorizedSetDigest(validated, bindings);
              if (!digest || !await currentFragmentsMatch(
                current, certificateValues, sourceFileIds)) return null;
              return deepFreeze(frozenRecord([
                ['snapshotVersion', SNAPSHOT_VERSION],
                ['partitionKey', current.partitionKey],
                ['sourceBindings', bindings],
                ['records', validated.snapshot.records],
                ['relations', validated.snapshot.relations],
                ['authorizedSetDigest', digest]
              ]));
            } finally {
              graphQuery.releaseScope(scope);
            }
          }
        );
      } catch (_error) {
        return decision('closed');
      }
      if (!result || result.decision !== 'admitted') return result || decision('closed');
      var value = dataValue(result, 'value');
      if (value && value.status === 'blocked' &&
          (value.reason === 'source-unreadable' || value.reason === 'source-unavailable') &&
          Array.isArray(value.sourceBindings)) return result;
      if (value && value.snapshotVersion === SNAPSHOT_VERSION &&
          validDigest(value.authorizedSetDigest, 'sgx1:') &&
          Array.isArray(value.records) && Array.isArray(value.relations)) return result;
      return decision('closed');
    }

    function getById(exactTuple, sourceSelection, input) {
      return queryOperation('query', 'getById', exactTuple, sourceSelection, input);
    }

    function searchLexical(exactTuple, sourceSelection, input) {
      return queryOperation('query', 'searchLexical', exactTuple, sourceSelection, input);
    }

    function neighbors(exactTuple, sourceSelection, input) {
      return queryOperation('query', 'neighbors', exactTuple, sourceSelection, input);
    }

    function inspectProvenance(exactTuple, sourceSelection, input) {
      return queryOperation('query', 'inspectProvenance', exactTuple, sourceSelection, input);
    }

    async function inspectStatus(exactTuple, sourceInput) {
      var input = normalizeSourceInput(sourceInput);
      if (!input) return decision('closed');
      var result = await runCorpusOperation(
        'display', exactTuple, frozenRecord([['sourceFileId', input.sourceFileId]]),
        async function(certificate) {
          var current = await certifiedFragment(certificate);
          if (isStaleFragmentBinding(current)) return current;
          if (!current || current.sourceFileId !== input.sourceFileId) return null;
          var metadata = current.metadata;
          var allowed = ['absent', 'withheld', 'staging', 'published', 'purging', 'repairing'];
          var state = allowed.indexOf(metadata.state) === -1 ? 'withheld' : metadata.state;
          return frozenRecord([
            ['state', state], ['version', VERSION],
            ['schemaVersion', metadata.schemaVersion || graphSchema.VERSION],
            ['promptVersion', metadata.promptVersion || graphSchema.PROMPT_VERSION],
            ['recordCount', Number.isSafeInteger(metadata.recordCount) ? metadata.recordCount : 0],
            ['relationCount', Number.isSafeInteger(metadata.relationCount) ? metadata.relationCount : 0]
          ]);
        }
      );
      if (result && result.decision === 'admitted' &&
          isStaleFragmentBinding(result.value)) {
        await fenceStaleAfterRead(exactTuple, result.value);
        return decision('closed');
      }
      return result;
    }

    return Object.freeze({
      buildSource: replaceSource,
      updateSource: replaceSource,
      replaceCandidateRelations: replaceCandidateRelations,
      getById: getById,
      searchLexical: searchLexical,
      neighbors: neighbors,
      inspectProvenance: inspectProvenance,
      snapshotExactSet: snapshotExactSet,
      inspectStatus: inspectStatus
    });
  }

  var api = Object.freeze({ VERSION: VERSION, create: create });
  global.FsbSkopeoGraphEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
