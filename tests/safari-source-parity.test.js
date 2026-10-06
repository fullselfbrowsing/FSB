/**
 * Anti-fork gate for the Safari build.
 *
 * FSB keeps ONE source tree. The Safari build is a transform of extension/,
 * not a copy that drifts. This test builds into a temp directory and asserts
 * that EVERY emitted file is byte-identical to its extension/ counterpart
 * except a tiny, explicitly enumerated allowlist.
 *
 * If someone "just tweaks" a file in the Safari output, or the build script
 * grows a quiet regex rewrite, this fails immediately.
 *
 * It also proves the background.js transform is ANCHOR-FREE: the original
 * source must survive as one contiguous substring, so the transform can never
 * mis-target one of background.js's byte-frozen regions.
 *
 * Run: node tests/safari-source-parity.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');

// The ONLY files allowed to differ from extension/.
const TRANSFORMED = ['manifest.json', 'background.js'];
// Files that exist only in the build output.
const GENERATED = ['BUILD-INFO.json'];

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

function walk(dir, base, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const abs = path.join(dir, name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (fs.statSync(abs).isDirectory()) walk(abs, base, out);
    else out.push(rel);
  }
  return out;
}

function extensionResourcePaths(pbx) {
  const sectionStart = pbx.indexOf('/* Begin PBXResourcesBuildPhase section */');
  const sectionEnd = pbx.indexOf('/* End PBXResourcesBuildPhase section */');
  if (sectionStart < 0 || sectionEnd <= sectionStart) {
    throw new Error('PBXResourcesBuildPhase section not found');
  }

  const section = pbx.slice(sectionStart, sectionEnd);
  const phases = [...section.matchAll(
    /([0-9A-F]{24}) \/\* Resources \*\/ = \{([\s\S]*?)\n\t\t\};/g
  )];
  const extensionPhase = phases.find((match) => match[2].includes('background.js in Resources'));
  if (!extensionPhase) throw new Error('Safari extension Resources build phase not found');

  const buildFileIds = [...extensionPhase[2].matchAll(
    /([0-9A-F]{24}) \/\* .*? in Resources \*\//g
  )].map((match) => match[1]);
  const buildFileToRef = new Map([...pbx.matchAll(
    /([0-9A-F]{24}) \/\* .*? in Resources \*\/ = \{isa = PBXBuildFile; fileRef = ([0-9A-F]{24})/g
  )].map((match) => [match[1], match[2]]));
  const refToPath = new Map([...pbx.matchAll(
    /([0-9A-F]{24}) \/\* .*? \*\/ = \{isa = PBXFileReference; ([^}]*)\};/g
  )].map((match) => {
    const pathMatch = match[2].match(/\bpath = ("([^"]+)"|([^;]+));/);
    return [match[1], pathMatch ? (pathMatch[2] || pathMatch[3]).trim() : null];
  }));

  return buildFileIds.map((buildFileId) => {
    const fileRef = buildFileToRef.get(buildFileId);
    const resourcePath = fileRef && refToPath.get(fileRef);
    if (!resourcePath || !resourcePath.startsWith('Resources/')) {
      throw new Error(`could not resolve extension resource build file ${buildFileId}`);
    }
    return resourcePath.slice('Resources/'.length);
  });
}

(async function run() {
  const mod = await import('../scripts/build-safari.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-safari-parity-'));

  try {
    const res = mod.buildSafari({ out: tmp });
    passAssert(res.files > 400, `build emitted ${res.files} files`);

    const builtFiles = walk(tmp, tmp);
    const srcFiles = walk(EXT, EXT).filter((f) => !f.endsWith('.map'));

    console.log('\n=== 1. every emitted file is byte-identical (except the allowlist) ===');
    const differing = [];
    const orphans = [];
    for (const rel of builtFiles) {
      if (GENERATED.includes(rel)) continue;
      const srcPath = path.join(EXT, rel);
      if (!fs.existsSync(srcPath)) { orphans.push(rel); continue; }
      if (TRANSFORMED.includes(rel)) continue;
      const a = fs.readFileSync(srcPath);
      const b = fs.readFileSync(path.join(tmp, rel));
      if (!a.equals(b)) differing.push(rel);
    }
    passAssertEqual(differing.length, 0,
      'no unexpected file differs' + (differing.length ? ' -- ' + differing.slice(0, 10).join(', ') : ''));
    passAssertEqual(orphans.length, 0,
      'no file exists only in the build output' + (orphans.length ? ' -- ' + orphans.join(', ') : ''));

    console.log('\n=== 2. exclusions are exactly what the build script declares ===');
    const info = JSON.parse(fs.readFileSync(path.join(tmp, 'BUILD-INFO.json'), 'utf8'));
    const builtSet = new Set(builtFiles);
    const missing = srcFiles.filter((f) => !builtSet.has(f));
    const declared = new Set(info.excluded);
    const undeclared = missing.filter(
      (f) => ![...declared].some((ex) => f === ex || f.startsWith(ex + '/'))
    );
    passAssertEqual(undeclared.length, 0,
      'every omitted file is a declared exclusion' + (undeclared.length ? ' -- ' + undeclared.join(', ') : ''));
    for (const ex of info.excluded) {
      passAssert(!builtSet.has(ex), `excluded from build: ${ex}`);
    }

    console.log('\n=== 3. test-data IS shipped (runtime fetch target) ===');
    passAssert(builtFiles.some((f) => f.startsWith('test-data/json-baselines/')),
      'test-data/json-baselines survives (utils/token-comparator.js fetches it)');

    console.log('\n=== 4. the Lattice IIFE bundle ships, the ESM build does not ===');
    passAssert(builtSet.has('dist/offscreen/lattice-host.iife.js'), 'IIFE bundle present');
    passAssert(!builtSet.has('dist/offscreen/lattice-host.js'), 'ESM bundle absent');

    console.log('\n=== 5. background.js transform is ANCHOR-FREE ===');
    const srcBg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
    const outBg = fs.readFileSync(path.join(tmp, 'background.js'), 'utf8');
    const idx = outBg.indexOf(srcBg);
    passAssert(idx > 0, 'original background.js survives as one contiguous substring (pure prepend/append)');
    passAssert(outBg.slice(0, idx).includes('__FSB_FORCE_PLATFORM__'), 'preamble sets the platform flag');
    passAssert(outBg.slice(0, idx).includes('FsbPlatform.install()'), 'preamble calls install()');
    passAssert(outBg.slice(idx + srcBg.length).includes('lattice-host.iife.js'),
      'epilogue loads the Lattice IIFE bundle AFTER the original source');
    // Without the capture scope, background.js's fsbHandleRuntimeMessage joins
    // the loopback fan-out and answers every lattice-* envelope with
    // { error: 'Unknown action' } before the host is ever reached.
    passAssert(/captureLoopback\(function \(\) \{\s*importScripts\('dist\/offscreen\/lattice-host\.iife\.js'\);\s*\}\);/
      .test(outBg.slice(idx + srcBg.length)),
      'epilogue loads the Lattice host inside captureLoopback() so only its listeners join the fan-out');

    console.log('\n=== 6. Chrome pins are unaffected by the transform ===');
    passAssertEqual((srcBg.match(/importScripts/g) || []).length, 333,
      'extension/background.js still has exactly 333 script-import mentions');
    passAssertEqual((srcBg.match(/importScripts\(/g) || []).length, 329,
      'extension/background.js still has exactly 329 script-import call sites');

    console.log('\n=== 7. adapter + native transport are INLINED, not script-imported ===');
    const adapter = fs.readFileSync(path.join(EXT, 'utils', 'platform-adapter.js'), 'utf8');
    passAssert(outBg.includes(adapter), 'adapter source is inlined verbatim into the Safari background.js');
    passAssertEqual(info.adapterSha256.length, 64, 'BUILD-INFO records the adapter sha256');
    const contentFilesAt = srcBg.indexOf('const CONTENT_SCRIPT_FILES = [');
    const contentFilesEnd = srcBg.indexOf('];', contentFilesAt);
    const contentFilesBlock = contentFilesAt >= 0 && contentFilesEnd > contentFilesAt
      ? srcBg.slice(contentFilesAt, contentFilesEnd)
      : '';
    passAssert(contentFilesBlock.length > 0, 'CONTENT_SCRIPT_FILES is present');
    passAssert(!contentFilesBlock.includes('utils/platform-adapter.js'),
      'platform adapter is not injected into content pages');

    const transport = fs.readFileSync(path.join(EXT, 'ws', 'mcp-native-transport.js'), 'utf8');
    passAssert(outBg.includes(transport), 'native transport is inlined verbatim');
    passAssertEqual(info.nativeTransportSha256.length, 64, 'BUILD-INFO records the transport sha256');

    const fileReader = fs.readFileSync(path.join(EXT, 'utils', 'native-file-reader.js'), 'utf8');
    passAssert(outBg.includes(fileReader), 'native file reader is inlined verbatim');
    passAssertEqual(info.nativeFileReaderSha256.length, 64, 'BUILD-INFO records the file-reader sha256');
    // executeUploadFile() resolves FsbNativeFileReader off the global, and it
    // lives in background.js itself, so the reader must precede the body.
    const readerAt = outBg.indexOf('globalScope.FsbNativeFileReader = api');
    const bodyAt = outBg.indexOf('async function executeUploadFile');
    passAssert(readerAt > -1 && bodyAt > -1 && readerAt < bodyAt,
      'FsbNativeFileReader is defined BEFORE executeUploadFile');
    // _createSocket() resolves FsbNativeBridgeSocket off the global, so the
    // transport must be defined before background.js imports the bridge client.
    const defAt = outBg.indexOf('globalScope.FsbNativeBridgeSocket = FsbNativeBridgeSocket');
    const useAt = outBg.indexOf("importScripts('ws/mcp-bridge-client.js')");
    passAssert(defAt > -1 && useAt > -1 && defAt < useAt,
      'FsbNativeBridgeSocket is defined BEFORE ws/mcp-bridge-client.js is loaded');

    console.log('\n=== 8. the Xcode project does NOT duplicate the extension ===');
    // `safari-web-extension-converter --copy-resources` copies all ~30MB / 518
    // files into the tracked Xcode project. That is a second source tree that
    // goes stale immediately, so it is replaced by a symlink to build/safari.
    // Re-running the converter would silently reintroduce the copy.
    const resPath = path.join(ROOT, 'safari', 'FSB', 'FSB Extension', 'Resources');
    if (fs.existsSync(resPath)) {
      const st = fs.lstatSync(resPath);
      passAssert(st.isSymbolicLink(),
        'safari/FSB/FSB Extension/Resources is a SYMLINK, not a duplicated tree');
      if (st.isSymbolicLink()) {
        passAssertEqual(fs.readlinkSync(resPath), '../../../build/safari',
          'symlink points at the generated payload');
      }
    } else {
      passAssert(true, 'Xcode project not scaffolded yet (skipped)');
    }

    console.log('\n=== 8b. Xcode resource phase matches the generated payload ===');
    const resourceProjectPath = path.join(ROOT, 'safari', 'FSB', 'FSB.xcodeproj', 'project.pbxproj');
    if (fs.existsSync(resourceProjectPath)) {
      const pbxResources = extensionResourcePaths(fs.readFileSync(resourceProjectPath, 'utf8'));
      const generatedTopLevel = [...new Set(builtFiles.map((rel) => rel.split('/')[0]))].sort();
      const xcodeTopLevel = [...new Set(pbxResources)].sort();
      const missingFromXcode = generatedTopLevel.filter((name) => !xcodeTopLevel.includes(name));
      const extraInXcode = xcodeTopLevel.filter((name) => !generatedTopLevel.includes(name));
      passAssertEqual(pbxResources.length, xcodeTopLevel.length,
        'extension Resources phase has no duplicate top-level entries');
      passAssertEqual(missingFromXcode.length, 0,
        'every generated top-level entry is in the extension Resources phase' +
        (missingFromXcode.length ? ` -- missing: ${missingFromXcode.join(', ')}` : ''));
      passAssertEqual(extraInXcode.length, 0,
        'extension Resources phase has no entries absent from the generated payload' +
        (extraInXcode.length ? ` -- extra: ${extraInXcode.join(', ')}` : ''));
    } else {
      passAssert(true, 'project.pbxproj not present (resource parity skipped)');
    }

    console.log('\n=== 9. native host invariants (no Swift test target reaches these) ===');
    // Host->extension chunking is the one direction with no JS-side coverage:
    // ws/mcp-native-transport.js can reassemble chunks, but only if the
    // coordinator actually emits them. Two halves have to hold together --
    // nextOutbound() chunks an oversized HEAD, and drainBatch() refuses to
    // append a later oversized frame into a batch. Pinning only the first half
    // is what let a frame that was not at the head ship whole, over Safari's
    // per-message ceiling.
    const coordPath = path.join(ROOT, 'safari', 'FSB', 'Shared', 'BridgeCoordinator.swift');
    if (fs.existsSync(coordPath)) {
      const coord = fs.readFileSync(coordPath, 'utf8');
      passAssert(coord.includes('NativeFraming.encode('),
        'BridgeCoordinator chunks oversized payloads via NativeFraming.encode');
      const discardAt = coord.indexOf('    private func discardSocket(reason: String)');
      const discardEnd = coord.indexOf('    /// Any inbound message proves', discardAt);
      const discardBlock = discardAt >= 0 && discardEnd > discardAt
        ? coord.slice(discardAt, discardEnd)
        : '';
      passAssert(discardBlock.includes('reassembly.removeAll()'),
        'discardSocket clears abandoned NativeFraming reassembly buffers');

      // nextOutbound() only inspects inbound.first, so drainBatch is the only
      // thing keeping a LATER oversized frame out of a batch.
      const drainAt = coord.indexOf('    private func drainBatch()');
      const drainEnd = coord.indexOf('\n    }', drainAt);
      // Strip comments first: the rationale for each half is spelled out in
      // prose right there, and a bare substring match would be satisfied by the
      // explanation alone even after the code it explains was deleted.
      const drainCode = (drainAt >= 0 && drainEnd > drainAt
        ? coord.slice(drainAt, drainEnd)
        : '').replace(/^\s*\/\/.*$/gm, '');
      passAssert(/maxFrameBytes/.test(drainCode),
        'drainBatch refuses to batch a frame past the per-message ceiling');
      passAssert(/!frames\.isEmpty/.test(drainCode),
        'the ceiling guard exempts the first frame so an oversized head still reaches the chunk path');

      // Nil-ing callbacks in discardSocket() cannot recall a block the old
      // session already queued, so each callback must check it is still the
      // current session before touching coordinator state.
      const sliceFn = (start, end) => {
        const a = coord.indexOf(start);
        const b = coord.indexOf(end, a);
        return (a >= 0 && b > a ? coord.slice(a, b) : '').replace(/^\s*\/\/.*$/gm, '');
      };
      const openCode = sliceFn('    func handleOpen(', '    // MARK: - extension -> server');
      passAssertEqual((openCode.match(/self\.socket === session/g) || []).length, 3,
        'onOpen/onText/onClosed each ignore a superseded session');

      // The cap has to hold while the linger runs, not just when it arms.
      const enqueueCode = sliceFn('    private func enqueueInbound(', '\n    }');
      passAssert(/enforceLingerCap\(\)/.test(enqueueCode),
        'enqueueInbound enforces the linger buffer cap on every frame');

      // The watchdog checks silence on `queue`. A queue.async hop before arming
      // the linger let a poll or open land in between, and the linger then
      // closed a live socket with no `closed` frame to tell the extension.
      const lingerCode = sliceFn('    private func portDisconnected()', '    /// Buffer overflow during the linger');
      passAssert(lingerCode.length > 0 && !/queue\.async/.test(lingerCode),
        'portDisconnected arms the linger in the same queue turn as the silence check');

      // Silence counts from when a held poll is answered, not from its arrival;
      // otherwise the 5s poll wait alone fills the 5s silence window.
      const pollCode = sliceFn('    func handlePoll(', '    private func enqueueInbound(');
      const flushCode = sliceFn('    private func flushToPoll()', '\n    }');
      const deliverCode = sliceFn('    private func deliver(', '\n    }');
      const retireCode = sliceFn('    private func retirePreviousPort()', '\n    }\n');
      passAssert(/self\.parkedPoll = nil\s+self\.lastContactAt = Date\(\)/.test(pollCode),
        'the poll timer stamps contact when it answers the held poll');
      passAssert(/lastContactAt = Date\(\)/.test(flushCode), 'flushToPoll stamps contact when it answers the held poll');
      passAssert(/lastContactAt = Date\(\)/.test(deliverCode), 'deliver stamps contact when it answers the held poll');
      passAssert(retireCode.length > 0 && !/lastContactAt/.test(retireCode),
        'retirePreviousPort does not stamp contact for a port that is going away');
    } else {
      passAssert(true, 'BridgeCoordinator.swift not present (skipped)');
    }

    // An app extension's bundle id must be prefixed by its containing app's.
    // The converter emits both, and a re-run can reintroduce a mismatched pair.
    const pbxPath = path.join(ROOT, 'safari', 'FSB', 'FSB.xcodeproj', 'project.pbxproj');
    if (fs.existsSync(pbxPath)) {
      const pbx = fs.readFileSync(pbxPath, 'utf8');
      const ids = [...pbx
        .matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim());
      const appId = ids.filter((id) => !id.endsWith('.Extension')).sort((a, b) => a.length - b.length)[0];
      passAssert(!!appId, 'project.pbxproj declares an app bundle id' + (appId ? ` (${appId})` : ''));
      const orphans = ids.filter((id) => id !== appId && !id.startsWith(appId + '.'));
      passAssertEqual(orphans.length, 0,
        'every extension bundle id is prefixed by the app id' +
        (orphans.length ? ` -- ${[...new Set(orphans)].join(', ')} vs ${appId}` : ''));

      const sharedDir = path.join(ROOT, 'safari', 'FSB', 'Shared');
      const sharedFiles = fs.readdirSync(sharedDir).filter((name) => name.endsWith('.swift'));
      for (const name of sharedFiles) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const memberships = (pbx.match(new RegExp(
          `/\\* ${escaped} in Sources \\*/ = \\{isa = PBXBuildFile`, 'g'
        )) || []).length;
        passAssertEqual(memberships, 2, `${name} belongs to both Xcode targets`);
      }
      passAssertEqual((pbx.match(/CODE_SIGN_ENTITLEMENTS = FSB\/FSB\.entitlements;/g) || []).length, 2,
        'app entitlements are wired in Debug and Release');
      passAssertEqual((pbx.match(/CODE_SIGN_ENTITLEMENTS = "FSB Extension\/FSB_Extension\.entitlements";/g) || []).length, 2,
        'extension entitlements are wired in Debug and Release');
      passAssertEqual((pbx.match(/MACOSX_DEPLOYMENT_TARGET = 14\.0;/g) || []).length, 2,
        'project Debug and Release both target macOS 14.0');
      passAssertEqual((pbx.match(/MACOSX_DEPLOYMENT_TARGET = 10\.14;/g) || []).length, 0,
        'targets do not retain the converter\'s stale macOS 10.14 override');
    } else {
      passAssert(true, 'project.pbxproj not present (skipped)');
    }

    const appEntitlements = fs.readFileSync(
      path.join(ROOT, 'safari', 'FSB', 'FSB', 'FSB.entitlements'), 'utf8'
    );
    const extensionEntitlements = fs.readFileSync(
      path.join(ROOT, 'safari', 'FSB', 'FSB Extension', 'FSB_Extension.entitlements'), 'utf8'
    );
    const appGroupPattern = /<key>com\.apple\.security\.application-groups<\/key>\s*<array>\s*<string>([^<]+)<\/string>/;
    const appGroup = (appEntitlements.match(appGroupPattern) || [])[1];
    const extensionGroup = (extensionEntitlements.match(appGroupPattern) || [])[1];
    passAssert(!!appGroup, 'app declares an application-groups entitlement');
    passAssertEqual(extensionGroup, appGroup, 'app and extension declare the same App Group');
    passAssert(appGroup && appGroup.startsWith('$(TeamIdentifierPrefix)'),
      'App Group includes the signing team prefix');

    // Security-scoped bookmarks need this key on BOTH targets: the app creates
    // them in GrantedRoots.addGrant, the extension resolves them. Without it
    // bookmarkData(options: .withSecurityScope) throws under App Sandbox, every
    // folder grant is silently dropped, and upload_file can only ever report
    // no_granted_folders. There is no Xcode build setting for it -- so nothing
    // but this assertion notices if a capabilities-UI round-trip drops it.
    const bookmarkKey = /<key>com\.apple\.security\.files\.bookmarks\.app-scope<\/key>\s*<true\/>/;
    passAssert(bookmarkKey.test(appEntitlements),
      'app declares the app-scoped bookmarks entitlement');
    passAssert(bookmarkKey.test(extensionEntitlements),
      'extension declares the app-scoped bookmarks entitlement');

    const grantedRoots = fs.readFileSync(
      path.join(ROOT, 'safari', 'FSB', 'Shared', 'GrantedRoots.swift'), 'utf8'
    );
    passAssert(grantedRoots.includes('SecTaskCopyValueForEntitlement') &&
      grantedRoots.includes('com.apple.security.application-groups'),
    'GrantedRoots resolves the runtime suite from the signed App Group entitlement');
    passAssert(!/appGroupId\s*=\s*"com\.fullselfbrowsing\.fsb"/.test(grantedRoots),
      'GrantedRoots does not reuse the container bundle id as its suite name');
    // Preferences are cached per process: a grant written through an App Group
    // UserDefaults suite stays invisible to a running extension until Safari
    // quits. The store must be a file in the group container.
    const grantedRootsCode = grantedRoots.replace(/^\s*\/\/.*$/gm, '');
    passAssert(!/UserDefaults\s*\(/.test(grantedRootsCode),
      'GrantedRoots does not persist grants through a per-process-cached UserDefaults suite');
    passAssert(/containerURL\(forSecurityApplicationGroupIdentifier:/.test(grantedRootsCode),
      'GrantedRoots stores grants in the shared App Group container');

    console.log('\n---');
    console.log('passed:', passed, 'failed:', failed);
    if (failed > 0) process.exit(1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
