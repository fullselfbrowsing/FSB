/**
 * Session playback page.
 *
 * Plays back a page recording of an automation session like a video: each
 * tab the session acted on is a track rendered by the PhantomStream player
 * (an inert, script-free mirror), with one shared timeline of agent actions,
 * navigations and gaps. Nothing here re-runs an action or talks to a site;
 * the only network traffic is the page's own images and stylesheets, and the
 * "Load page images" switch turns those off.
 *
 * Route: ui/recording-player.html?session=<history session id>
 */
(function () {
  'use strict';

  var kit = globalThis.FsbRecordingPlayerKit;
  var store = globalThis.FsbPageRecordingStore;
  var locale = globalThis.fsbUiLocale;

  var ASSETS_PREF_KEY = 'fsb-player-load-assets';
  var THEME_PREF_KEY = 'fsb-theme';
  var SKIP_IDLE_MS = 4000;
  var SEEK_STEP_MS = 5000;
  var ACTION_LEAD_MS = 300;

  // English source -> catalog key (copy_ + first 10 hex of sha256(english)).
  var COPY = {
    loading: ['copy_0f0309db88', 'Loading recording…'],
    missing: ['copy_3e6af86b93', 'No recording was found for this session.'],
    failed: ['copy_3e0a806bfa', 'Could not load this recording.'],
    live: ['copy_00b3e86690', 'This session is still recording. Playback shows it up to now.'],
    truncated: ['copy_f5a13d552c', 'This recording was cut short because it reached its size limit.'],
    notStarted: ['copy_e7869cc29f', 'This tab opens later in the session.'],
    tab: ['copy_c867f88b72', 'Tab $NUMBER$'],
    play: ['copy_436e61016e', 'Play'],
    pause: ['copy_858e4ba7a2', 'Pause'],
    gap: ['copy_aeeb67ebe9', 'Nothing was recorded here: $REASON$'],
    reasonRestricted: ['copy_367f587bcc', 'a browser page FSB cannot record'],
    reasonNotHtml: ['copy_89a5dfdec6', 'this is not a web page'],
    reasonBlocked: ['copy_d2d36106ed', 'the page blocked recording'],
    reasonTooLarge: ['copy_3cb5448220', 'the page was too large to record'],
    reasonFull: ['copy_83a4a6f0f6', 'the recording reached its size limit'],
    reasonBehind: ['copy_b4dbe83fcc', 'the recorder fell behind'],
    reasonUnknown: ['copy_cd9603f2cf', 'recording paused']
  };

  var GAP_REASONS = {
    'restricted-page': 'reasonRestricted',
    'not-html': 'reasonNotHtml',
    'inject-blocked': 'reasonBlocked',
    'snapshot-too-large': 'reasonTooLarge',
    'recording-full': 'reasonFull',
    'backpressure': 'reasonBehind'
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    subtitle: $('rpSubtitle'),
    loadAssets: $('rpLoadAssets'),
    notice: $('rpNotice'),
    tabs: $('rpTabs'),
    follow: $('rpFollow'),
    stage: $('rpStage'),
    slate: $('rpSlate'),
    slateText: $('rpSlateText'),
    empty: $('rpEmpty'),
    emptyText: $('rpEmptyText'),
    captionText: $('rpCaptionText'),
    captionTool: $('rpCaptionTool'),
    prev: $('rpPrev'),
    play: $('rpPlay'),
    playIcon: $('rpPlayIcon'),
    next: $('rpNext'),
    time: $('rpTime'),
    markers: $('rpMarkers'),
    scrub: $('rpScrub'),
    speed: $('rpSpeed')
  };

  var model = {
    recording: null,
    t0: 0,
    duration: 0,
    tracks: [], // { trackId, label, origin, offset, firstT, lastT, events, container, player, chip }
    markers: [], // store markers, t made relative to t0
    actions: [], // action-start markers
    active: null,
    follow: true,
    playing: false,
    speed: 1,
    position: 0,
    switching: false
  };

  function say(id, subs) {
    var entry = COPY[id];
    if (!entry) return '';
    if (locale && typeof locale.text === 'function') return locale.text(entry[0], entry[1], subs);
    return entry[1].replace(/\$([A-Z_]+)\$/g, function (all, name) {
      var key = name.toLowerCase();
      return subs && subs[key] != null ? String(subs[key]) : all;
    });
  }

  // ---------------------------------------------------------------------------
  // Theme (same preference the side panel writes)
  // ---------------------------------------------------------------------------

  function applyTheme() {
    var pref = 'system';
    try { pref = localStorage.getItem(THEME_PREF_KEY) || 'system'; } catch (_error) { /* default */ }
    var dark = pref === 'dark' ||
      (pref !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function clock(ms) {
    var total = Math.max(0, Math.floor((ms || 0) / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function originOf(url) {
    try { return new URL(url).host; } catch (_error) { return ''; }
  }

  function showEmpty(text) {
    els.emptyText.textContent = text;
    els.empty.hidden = false;
  }

  function showNotice(text) {
    els.notice.textContent = text;
    els.notice.hidden = !text;
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  async function pickRecording(historyId) {
    var rows = await store.findRecordingsByHistorySessionId(historyId);
    rows = rows.filter(function (row) { return row.chunkCount > 0; });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
    return rows[0];
  }

  async function loadSubtitle(historyId) {
    try {
      var bag = await chrome.storage.local.get('fsbSessionIndex');
      var index = Array.isArray(bag.fsbSessionIndex) ? bag.fsbSessionIndex : [];
      var row = index.find(function (entry) { return entry && entry.id === historyId; });
      if (!row) return;
      var when = row.startTime ? new Date(row.startTime).toLocaleString() : '';
      // Task text is the session's own words; it is shown as written.
      els.subtitle.textContent = [row.task || '', when].filter(Boolean).join(' · ');
    } catch (_error) { /* subtitle is optional */ }
  }

  async function load() {
    var params = new URLSearchParams(location.search);
    var historyId = params.get('session') || '';
    if (!kit || !store || !historyId) {
      showEmpty(say('missing'));
      return;
    }
    loadSubtitle(historyId);
    var recording = await pickRecording(historyId);
    if (!recording) {
      showEmpty(say('missing'));
      return;
    }
    model.recording = recording;
    if (recording.status === store.STATUS_RECORDING) showNotice(say('live'));
    else if (recording.truncated) showNotice(say('truncated'));

    var markers = await store.readMarkers(recording.id);
    var trackIds = Object.keys(recording.tracks || {}).sort(function (a, b) {
      return (recording.tracks[a].startedAt || 0) - (recording.tracks[b].startedAt || 0);
    });
    var tracks = [];
    for (var i = 0; i < trackIds.length; i++) {
      var events = await store.readTrackEvents(recording.id, trackIds[i]);
      var hasSnapshot = events.some(function (e) { return e && e.type === kit.STREAM.SNAPSHOT; });
      if (!events.length || !hasSnapshot) continue;
      tracks.push({
        trackId: trackIds[i],
        events: events,
        firstT: events[0].t,
        lastT: events[events.length - 1].t
      });
    }
    if (!tracks.length) {
      showEmpty(say('missing'));
      return;
    }
    var allTimes = [];
    tracks.forEach(function (track) { allTimes.push(track.firstT, track.lastT); });
    markers.forEach(function (marker) { if (Number.isFinite(marker.t)) allTimes.push(marker.t); });
    model.t0 = Math.min.apply(null, allTimes);
    model.duration = Math.max(0, Math.max.apply(null, allTimes) - model.t0);
    model.markers = markers.map(function (marker) {
      return Object.assign({}, marker, { at: marker.t - model.t0 });
    });
    model.actions = model.markers.filter(function (marker) { return marker.kind === 'action-start'; });
    tracks.forEach(function (track, index) {
      track.offset = track.firstT - model.t0;
      track.label = say('tab', { number: index + 1 });
      var nav = model.markers.find(function (m) { return m.kind === 'navigation' && m.trackId === track.trackId; });
      track.origin = nav && nav.data ? originOf(nav.data.url) : '';
    });
    model.tracks = tracks;
    els.empty.hidden = true;
    buildTabs();
    buildMarkers();
    createPlayers();
    enableControls();
    await seekTo(0);
  }

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------

  function assetPolicy() {
    var allow = els.loadAssets.checked;
    return allow ? undefined : function () { return false; };
  }

  function createPlayers() {
    model.tracks.forEach(function (track) {
      if (track.player) {
        try { track.player.destroy(); } catch (_error) { /* already gone */ }
      }
      if (!track.container) {
        track.container = document.createElement('div');
        track.container.className = 'rp-track';
        track.container.hidden = true;
        els.stage.appendChild(track.container);
      }
      track.player = kit.createPlayer({
        container: track.container,
        recording: track.events,
        skipIdleMs: SKIP_IDLE_MS,
        inert: true,
        assetOriginPolicy: assetPolicy(),
        logger: { info: function () {}, warn: function () {}, error: function () {} }
      });
      track.player.on('time', function (info) { onPlayerTime(track, info); });
      track.player.on('ended', function () { onPlayerEnded(track); });
    });
  }

  function trackById(trackId) {
    return model.tracks.find(function (track) { return track.trackId === trackId; }) || null;
  }

  // In follow mode the stage shows the tab of the most recent agent action.
  function trackForTime(position) {
    if (!model.follow && model.active) return model.active;
    var latest = null;
    model.actions.forEach(function (marker) {
      if (marker.at <= position && marker.trackId) latest = marker;
    });
    var track = latest ? trackById(latest.trackId) : null;
    return track || model.tracks[0];
  }

  function showTrack(track) {
    model.tracks.forEach(function (candidate) {
      candidate.container.hidden = candidate !== track;
      if (candidate.chip) candidate.chip.setAttribute('aria-pressed', String(candidate === track && !model.follow));
    });
    model.active = track;
  }

  async function seekTo(position) {
    position = Math.max(0, Math.min(model.duration, position));
    model.position = position;
    var track = trackForTime(position);
    var wasPlaying = model.playing;
    if (model.active && model.active !== track) model.active.player.pause();
    showTrack(track);
    var local = position - track.offset;
    if (local < 0) {
      setSlate(say('notStarted'));
      await track.player.seek(0);
    } else {
      await track.player.seek(Math.min(local, track.player.duration));
    }
    renderPosition(position);
    if (wasPlaying && local >= 0) track.player.play({ speed: model.speed });
  }

  function onPlayerTime(track, info) {
    if (track !== model.active || model.switching) return;
    var position = track.offset + (info && Number.isFinite(info.currentTime) ? info.currentTime : 0);
    model.position = position;
    renderPosition(position);
    if (model.playing && model.follow) {
      var wanted = trackForTime(position);
      if (wanted !== track) switchWhilePlaying(wanted, position);
    }
  }

  async function switchWhilePlaying(track, position) {
    model.switching = true;
    try {
      model.active.player.pause();
      showTrack(track);
      await track.player.seek(Math.max(0, position - track.offset));
      if (model.playing) track.player.play({ speed: model.speed });
    } finally {
      model.switching = false;
    }
  }

  function onPlayerEnded(track) {
    if (track !== model.active) return;
    var position = track.offset + track.player.duration;
    // Another tab may still have more to show after this one ends.
    var later = model.tracks.filter(function (candidate) {
      return candidate !== track && candidate.offset + candidate.player.duration > position + 50;
    });
    if (model.playing && later.length && model.follow) {
      switchWhilePlaying(later[0], Math.max(position, later[0].offset));
      return;
    }
    setPlaying(false);
    renderPosition(Math.min(model.duration, position));
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  function setSlate(text) {
    els.slateText.textContent = text || '';
    els.slate.hidden = !text;
  }

  function gapTextAt(position) {
    if (!model.active) return '';
    var latest = null;
    model.markers.forEach(function (marker) {
      if (marker.trackId !== model.active.trackId || marker.at > position) return;
      if (marker.kind === 'gap' || marker.kind === 'navigation') latest = marker;
    });
    if (!latest || latest.kind !== 'gap') return '';
    var reasonId = GAP_REASONS[latest.data && latest.data.reason] || 'reasonUnknown';
    return say('gap', { reason: say(reasonId) });
  }

  function renderPosition(position) {
    els.scrub.value = String(Math.round(position));
    els.time.textContent = clock(position) + ' / ' + clock(model.duration);
    var local = model.active ? position - model.active.offset : 0;
    setSlate(local < 0 ? say('notStarted') : gapTextAt(position));
    var current = null;
    model.actions.forEach(function (marker) { if (marker.at <= position) current = marker; });
    var data = current && current.data ? current.data : {};
    // Labels were redacted when recorded: the agent's own words, typed text removed.
    els.captionText.textContent = data.label || '';
    els.captionTool.textContent = data.tool || '';
  }

  function buildTabs() {
    if (model.tracks.length < 2) return;
    els.tabs.hidden = false;
    model.tracks.forEach(function (track) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rp-chip';
      chip.setAttribute('aria-pressed', 'false');
      var label = document.createElement('span');
      label.textContent = track.label;
      chip.appendChild(label);
      if (track.origin) {
        var origin = document.createElement('span');
        origin.className = 'rp-chip-origin';
        origin.setAttribute('translate', 'no');
        origin.textContent = track.origin;
        chip.appendChild(origin);
      }
      chip.addEventListener('click', function () {
        model.follow = false;
        els.follow.setAttribute('aria-pressed', 'false');
        model.active = track;
        seekTo(model.position);
      });
      track.chip = chip;
      els.tabs.appendChild(chip);
    });
    els.follow.addEventListener('click', function () {
      model.follow = true;
      els.follow.setAttribute('aria-pressed', 'true');
      seekTo(model.position);
    });
  }

  function buildMarkers() {
    while (els.markers.firstChild) els.markers.removeChild(els.markers.firstChild);
    if (!model.duration) return;
    model.markers.forEach(function (marker) {
      var kind = marker.kind === 'action-start' ? 'action'
        : marker.kind === 'navigation' ? 'navigation'
        : marker.kind === 'gap' ? 'gap' : null;
      if (!kind) return;
      var tick = document.createElement('span');
      tick.className = 'rp-marker ' + kind;
      tick.style.left = ((marker.at / model.duration) * 100).toFixed(3) + '%';
      els.markers.appendChild(tick);
    });
  }

  function setPlaying(playing) {
    model.playing = playing;
    els.playIcon.className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play');
    var label = say(playing ? 'pause' : 'play');
    els.play.setAttribute('aria-label', label);
    els.play.setAttribute('title', label);
  }

  async function togglePlay() {
    if (!model.active) return;
    if (model.playing) {
      setPlaying(false);
      model.active.player.pause();
      return;
    }
    if (model.position >= model.duration - 50) await seekTo(0);
    setPlaying(true);
    var local = model.position - model.active.offset;
    if (local < 0) await seekTo(model.active.offset);
    model.active.player.play({ speed: model.speed });
  }

  function stepAction(direction) {
    if (!model.actions.length) return;
    var target = null;
    if (direction > 0) {
      target = model.actions.find(function (m) { return m.at - ACTION_LEAD_MS > model.position + 10; });
    } else {
      for (var i = model.actions.length - 1; i >= 0; i--) {
        if (model.actions[i].at - ACTION_LEAD_MS < model.position - 500) { target = model.actions[i]; break; }
      }
    }
    if (target) seekTo(Math.max(0, target.at - ACTION_LEAD_MS));
  }

  function enableControls() {
    [els.play, els.prev, els.next, els.scrub, els.speed].forEach(function (el) { el.disabled = false; });
    els.scrub.max = String(Math.max(1, Math.round(model.duration)));
    els.prev.disabled = els.next.disabled = model.actions.length === 0;
    els.play.addEventListener('click', togglePlay);
    els.prev.addEventListener('click', function () { stepAction(-1); });
    els.next.addEventListener('click', function () { stepAction(1); });
    els.scrub.addEventListener('input', function () {
      if (model.playing && model.active) model.active.player.pause();
      seekTo(Number(els.scrub.value));
    });
    els.scrub.addEventListener('change', function () {
      if (model.playing && model.active) model.active.player.play({ speed: model.speed });
    });
    els.speed.addEventListener('change', function () {
      model.speed = Number(els.speed.value) || 1;
      if (model.active) model.active.player.setSpeed(model.speed);
    });
    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(event) {
    var tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.shiftKey) stepAction(1); else seekTo(model.position + SEEK_STEP_MS);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (event.shiftKey) stepAction(-1); else seekTo(model.position - SEEK_STEP_MS);
    } else if (event.key === 'Home') {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seekTo(model.duration);
    }
  }

  function initAssetsSwitch() {
    try { els.loadAssets.checked = localStorage.getItem(ASSETS_PREF_KEY) !== 'off'; } catch (_error) { /* default on */ }
    els.loadAssets.addEventListener('change', function () {
      try { localStorage.setItem(ASSETS_PREF_KEY, els.loadAssets.checked ? 'on' : 'off'); } catch (_error) { /* not persisted */ }
      if (!model.tracks.length) return;
      var position = model.position;
      setPlaying(false);
      createPlayers();
      seekTo(position);
    });
  }

  async function start() {
    applyTheme();
    try {
      if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    } catch (_error) { /* older matchMedia */ }
    window.addEventListener('storage', function (event) { if (event.key === THEME_PREF_KEY) applyTheme(); });
    if (locale && typeof locale.boot === 'function') {
      try {
        await locale.boot();
        locale.apply(document);
      } catch (_error) { /* English fallback */ }
    }
    initAssetsSwitch();
    try {
      await load();
    } catch (_error) {
      showEmpty(say('failed'));
    }
  }

  start();
})();
