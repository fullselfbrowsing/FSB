/**
 * KnowledgeGraph -- Consolidated 3D mind map of FSB's built-in site knowledge
 *
 * Pure Canvas with 3D projection. No external dependencies.
 * Renders all built-in site-guide categories and sites as a single rotating 3D graph.
 *
 * Public API:
 *   KnowledgeGraph.render(container, options)   - Create canvas, build data, start animation
 *   KnowledgeGraph.destroy(container)           - Cancel animation, cleanup
 *   KnowledgeGraph.refresh()                    - Rebuild data, preserve camera
 *   KnowledgeGraph.setDetailLevel(level)        - 'simple' or 'full'
 *   KnowledgeGraph.highlight(query)             - Dim non-matching, emphasize matches
 */

const KnowledgeGraph = (function () {
  'use strict';

  // ---------------------------------------------------------------
  // Color palette (same 12 as SiteGraph)
  // ---------------------------------------------------------------
  var COLORS = [
    '#4285f4', '#34a853', '#ea4335', '#fbbc04',
    '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
    '#14b8a6', '#a855f7', '#0891b2', '#d946ef'
  ];

  // Softer palette for dark mode -- same hues, muted/lighter to glow on dark backgrounds
  var COLORS_DARK = [
    '#5b9bf5', '#4ec973', '#f07068', '#f5d058',
    '#a78bfa', '#38d0e8', '#f472b6', '#fb923c',
    '#3dd6c4', '#c084fc', '#22b8cf', '#e879f9'
  ];

  var CATEGORY_ORDER = [
    'E-Commerce & Shopping',
    'Social Media',
    'Finance & Trading',
    'Travel & Booking',
    'Email Platforms',
    'Coding Platforms',
    'Career & Job Search',
    'Gaming Platforms',
    'Productivity Tools',
    'Design & Whiteboard',
    'Games',
    'Media',
    'Music',
    'News',
    'Reference',
    'Sports',
    'Utilities'
  ];

  // Task-discovered site color (teal/cyan -- distinct from built-in categories)
  var TASK_SITE_COLOR = '#0d9488';
  var TASK_SITE_COLOR_DARK = '#2dd4bf';

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var _state = null; // active render state
  var _taskMemories = []; // task memory data for knowledge graph integration
  var DIMMED_NODE_ALPHA = 0.38;
  var DIMMED_LINK_ALPHA = 0.32;

  // ---------------------------------------------------------------
  // Data consolidation -- free-floating sites, color-coded by category
  // ---------------------------------------------------------------
  function buildKnowledgeGraphData(detailLevel) {
    if (typeof getSiteGuidesByCategory !== 'function') return { nodes: [], links: [] };

    var grouped = getSiteGuidesByCategory();
    var nodes = [];
    var links = [];

    // Root node
    nodes.push({
      id: 'root',
      label: 'FSB',
      depth: 0,
      type: 'root',
      color: '#ffffff',
      x3d: 0, y3d: 0, z3d: 0
    });

    // Category order (drives color + layout). Overview shows categories;
    // Full Detail expands each category out to its actual sites.
    var orderedCats = CATEGORY_ORDER.filter(function (c) { return grouped[c]; });
    var extraCats = Object.keys(grouped).filter(function (c) { return CATEGORY_ORDER.indexOf(c) === -1; });
    var allCats = orderedCats.concat(extraCats);

    var R_CAT = 180;   // category sphere radius
    var R_SITE = 350;  // site shell radius
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));
    var nCat = allCats.length;
    var expanded = detailLevel === 'full';

    for (var ci = 0; ci < nCat; ci++) {
      var catName = allCats[ci];
      var guides = grouped[catName] || [];
      var colorIdx = ci % COLORS.length;
      var catColor = COLORS[colorIdx];

      // Category node placed on inner sphere via golden-angle spiral
      var cTheta = goldenAngle * ci;
      var cPhi = Math.acos(1 - 2 * (ci + 0.5) / nCat);
      var ccx = R_CAT * Math.sin(cPhi) * Math.cos(cTheta);
      var ccy = R_CAT * Math.cos(cPhi);
      var ccz = R_CAT * Math.sin(cPhi) * Math.sin(cTheta);

      var catId = 'cat:' + ci;
      nodes.push({
        id: catId,
        label: catName,
        fullLabel: [catName].concat(guides.map(function (g) { return g.site || ''; })).join(' '),
        depth: 1,
        type: 'site',
        isCat: true,
        color: catColor,
        colorIndex: colorIdx,
        categoryName: catName,
        siteCount: guides.length,
        selectorCount: 0,
        workflowCount: 0,
        warningCount: 0,
        x3d: ccx, y3d: ccy, z3d: ccz
      });
      links.push({ source: 'root', target: catId });

      if (!expanded || guides.length === 0) continue;

      // Expanded: scatter this category's sites in a cap around the
      // category's outward direction so they branch off their parent.
      var dir = normalize({ x: ccx, y: ccy, z: ccz });
      var perp1 = crossProduct(dir, { x: 0, y: 1, z: 0 });
      if (vecLen(perp1) < 0.01) perp1 = crossProduct(dir, { x: 1, y: 0, z: 0 });
      perp1 = normalize(perp1);
      var perp2 = normalize(crossProduct(dir, perp1));
      var k = guides.length;
      var capR = Math.min(165, 30 + k * 7);

      for (var si = 0; si < k; si++) {
        var g = guides[si];
        var a = goldenAngle * si;
        var rr = capR * Math.sqrt((si + 0.5) / k);
        var ox = (perp1.x * Math.cos(a) + perp2.x * Math.sin(a)) * rr;
        var oy = (perp1.y * Math.cos(a) + perp2.y * Math.sin(a)) * rr;
        var oz = (perp1.z * Math.cos(a) + perp2.z * Math.sin(a)) * rr;
        var sx = dir.x * R_SITE + ox;
        var sy = dir.y * R_SITE + oy;
        var sz = dir.z * R_SITE + oz;

        nodes.push({
          id: 'site:' + ci + ':' + si,
          label: g.site || 'Unknown',
          fullLabel: [g.site || 'Unknown', catName].join(' '),
          depth: 2,
          type: 'site',
          color: catColor,
          colorIndex: colorIdx,
          categoryName: catName,
          selectorCount: g.selectors ? Object.keys(g.selectors).length : 0,
          workflowCount: g.workflows ? Object.keys(g.workflows).length : 0,
          warningCount: g.warnings ? g.warnings.length : 0,
          x3d: sx, y3d: sy, z3d: sz
        });
        links.push({ source: catId, target: 'site:' + ci + ':' + si });
      }
    }

    // ---- Task Memory discovered sites ----
    // Extension-only: surfaces domains the user has visited that aren't already
    // part of the built-in site guides, as root-level siblings of category
    // nodes (their own pseudo-category). One tier only, same as built-in sites
    // stopping at one tier below their category.
    if (_taskMemories.length > 0) {
      // Collect existing site labels to avoid duplicates (category nodes reuse
      // type 'site' too, so exclude those via isCat)
      var existingLabels = {};
      for (var n = 0; n < nodes.length; n++) {
        if (nodes[n].type === 'site' && !nodes[n].isCat) {
          existingLabels[nodes[n].label.toLowerCase()] = true;
        }
      }

      // Group task memories by domain
      var domainMap = {};
      for (var mi = 0; mi < _taskMemories.length; mi++) {
        var tm = _taskMemories[mi];
        var tmDomain = (tm.typeData && tm.typeData.session && tm.typeData.session.domain) ||
                       (tm.metadata && tm.metadata.domain) || '';
        if (!tmDomain) continue;
        if (!domainMap[tmDomain]) {
          domainMap[tmDomain] = { selectors: [] };
        }
        var tmLearned = (tm.typeData && tm.typeData.learned) || {};
        if (tmLearned.selectors) {
          for (var s = 0; s < tmLearned.selectors.length; s++) {
            if (domainMap[tmDomain].selectors.indexOf(tmLearned.selectors[s]) === -1) {
              domainMap[tmDomain].selectors.push(tmLearned.selectors[s]);
            }
          }
        }
      }

      // Add task-site nodes (root-level siblings of category nodes) for
      // domains not already covered by the built-in site guides
      var taskDomains = Object.keys(domainMap);
      var taskStartIdx = nCat; // continue golden-angle indexing after categories
      var tTotal = nCat + taskDomains.length;
      for (var ti = 0; ti < taskDomains.length; ti++) {
        var tdName = taskDomains[ti];
        if (existingLabels[tdName.toLowerCase()]) continue;

        var tsId = 'task-site:' + ti;
        var tsIdx = taskStartIdx + ti;

        var tTheta = goldenAngle * tsIdx;
        var tPhi = Math.acos(1 - 2 * (tsIdx + 0.5) / tTotal);

        var tsx = R_CAT * Math.sin(tPhi) * Math.cos(tTheta);
        var tsy = R_CAT * Math.cos(tPhi);
        var tsz = R_CAT * Math.sin(tPhi) * Math.sin(tTheta);

        var domData = domainMap[tdName];
        nodes.push({
          id: tsId,
          label: tdName,
          fullLabel: 'Task-Discovered',
          depth: 1,
          type: 'task-site',
          color: TASK_SITE_COLOR,
          categoryName: 'Task-Discovered',
          selectorCount: domData.selectors.length,
          workflowCount: 0,
          warningCount: 0,
          x3d: tsx, y3d: tsy, z3d: tsz
        });
        links.push({ source: 'root', target: tsId });
      }
    }

    return { nodes: nodes, links: links };
  }

  // ---------------------------------------------------------------
  // Vector math helpers
  // ---------------------------------------------------------------
  function crossProduct(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function vecLen(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  function normalize(v) {
    var len = vecLen(v);
    if (len < 0.0001) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  // ---------------------------------------------------------------
  // 3D Projection
  // ---------------------------------------------------------------
  var CAMERA_DISTANCE = 900;

  function project(x3d, y3d, z3d, rotY, rotX, zoom, cx, cy) {
    // Y-axis rotation (yaw)
    var cosY = Math.cos(rotY);
    var sinY = Math.sin(rotY);
    var x1 = x3d * cosY - z3d * sinY;
    var z1 = x3d * sinY + z3d * cosY;
    var y1 = y3d;

    // X-axis rotation (pitch)
    var cosX = Math.cos(rotX);
    var sinX = Math.sin(rotX);
    var y2 = y1 * cosX - z1 * sinX;
    var z2 = y1 * sinX + z1 * cosX;
    var x2 = x1;

    // Perspective projection
    var scale = CAMERA_DISTANCE / (CAMERA_DISTANCE + z2);
    scale *= zoom;

    return {
      x: cx + x2 * scale,
      y: cy + y2 * scale,
      z: z2,
      scale: scale
    };
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function renderFrame(state) {
    // Keep buffer in sync with CSS layout size
    if (state._syncCanvasSize) state._syncCanvasSize();

    var ctx = state.ctx;
    var canvas = state.canvas;
    var dpr = state.dpr;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    var cx = w / 2;
    var cy = h / 2;
    var nodes = state.nodes;
    var links = state.links;
    var t = state.time;

    // Read CSS variables for theming (cached; only recomputed when theme changes)
    var themeEl = state._themeEl || (state._themeEl = (state.container.closest && state.container.closest('[data-theme]')) || document.documentElement);
    var themeKey = (themeEl && themeEl.getAttribute('data-theme')) || '';
    if (!state.colors || state._themeKey !== themeKey) {
      var cs = getComputedStyle(state.container);
      state.colors = {
        text: cs.getPropertyValue('--text-primary').trim() || '#171717',
        text2: cs.getPropertyValue('--text-secondary').trim() || '#525252'
      };
      state._themeKey = themeKey;
    }
    var textColor = state.colors.text;
    var textSecondary = state.colors.text2;
    var isDark = themeKey === 'dark';

    // Clear (transparent — let the themed CSS background of the container show through)
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Project all nodes
    var projected = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      // Node drift (subtle breathing)
      var drift = Math.sin(t * 0.002 + i * 1.7) * 3;
      var driftY = Math.cos(t * 0.0015 + i * 2.3) * 2;

      var p = project(
        n.x3d + drift, n.y3d + driftY, n.z3d + drift * 0.5,
        state.rotY, state.rotX, state.zoom, cx, cy
      );
      projected.push({
        node: n,
        x: p.x, y: p.y, z: p.z, scale: p.scale,
        idx: i
      });
    }

    // Build node lookup by id for link drawing
    var nodeMap = {};
    for (var i = 0; i < projected.length; i++) {
      nodeMap[projected[i].node.id] = projected[i];
    }

    // Draw links (before nodes for correct layering)
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var src = nodeMap[link.source];
      var tgt = nodeMap[link.target];
      if (!src || !tgt) continue;

      // Depth-based opacity
      var avgZ = (src.z + tgt.z) / 2;
      var depthFactor = CAMERA_DISTANCE / (CAMERA_DISTANCE + avgZ);
      var alpha = Math.max(0.14, Math.min(0.58, depthFactor * 0.58));
      var lineBoost = 1;

      // Dimming for highlight
      if (state.highlightQuery) {
        var srcMatch = isHighlighted(src.node, state.highlightQuery);
        var tgtMatch = isHighlighted(tgt.node, state.highlightQuery);
        if (!srcMatch && !tgtMatch) {
          alpha *= DIMMED_LINK_ALPHA;
        } else {
          alpha = Math.max(alpha, isDark ? 0.58 : 0.52);
          lineBoost = 1.35;
        }
      }

      var color = resolveColor(tgt.node, isDark);
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.75, 1.65 * depthFactor * lineBoost);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Depth sort (painter's algorithm) -- far first
    projected.sort(function (a, b) { return b.z - a.z; });

    // Draw nodes
    for (var i = 0; i < projected.length; i++) {
      var p = projected[i];
      var n = p.node;
      var s = p.scale;

      // Depth-based opacity
      var depthAlpha = Math.max(0.2, Math.min(1.0, CAMERA_DISTANCE / (CAMERA_DISTANCE + p.z)));

      // Highlight dimming
      var highlighted = true;
      if (state.highlightQuery) {
        highlighted = isHighlighted(n, state.highlightQuery);
        if (n.type === 'root') {
          depthAlpha = Math.max(depthAlpha * 0.72, 0.55);
        } else if (!highlighted) {
          depthAlpha *= DIMMED_NODE_ALPHA;
        } else {
          depthAlpha = Math.max(depthAlpha, 0.92);
        }
      }

      if (n.type === 'root') {
        drawRootNode(ctx, p.x, p.y, s, n, depthAlpha, textColor);
      } else if (n.type === 'site') {
        drawSiteNode(ctx, p.x, p.y, s, n, depthAlpha, textColor, textSecondary, isDark, highlighted && !!state.highlightQuery);
      } else if (n.type === 'task-site') {
        drawTaskSiteNode(ctx, p.x, p.y, s, n, depthAlpha, textColor, textSecondary, isDark, highlighted && !!state.highlightQuery);
      } else if (n.type === 'detail') {
        drawDetailNode(ctx, p.x, p.y, s, n, depthAlpha, isDark);
      }
    }

    ctx.restore();

    // Store projected for hit testing
    state.projected = projected;
  }

  function drawRootNode(ctx, x, y, scale, node, alpha, textColor) {
    var r = 28 * scale;
    ctx.globalAlpha = alpha;

    // Glow
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 107, 53, 0.15)';
    ctx.fill();

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b35';
    ctx.fill();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(11 * scale) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FSB', x, y);

    ctx.globalAlpha = 1;
  }

  function drawSiteNode(ctx, x, y, scale, node, alpha, textColor, textSecondary, isDark, emphasized) {
    var isCat = node.isCat;
    var r = (isCat ? 13 : 7) * scale * (emphasized ? 1.12 : 1);
    var color = resolveColor(node, isDark);

    ctx.globalAlpha = alpha;

    if (emphasized) {
      ctx.beginPath();
      ctx.arc(x, y, r + 7 * scale, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, isDark ? 0.18 : 0.12);
      ctx.fill();
    }

    // Filled circle with category color
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, isCat ? 0.68 : 0.42);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, (isCat ? 2.7 : 1.9) * scale * (emphasized ? 1.25 : 1));
    ctx.stroke();

    // Label below
    var fontSize = Math.max(isCat ? 10 : 8, Math.round((isCat ? 13 : 9.5) * scale * (emphasized ? 1.04 : 1)));
    ctx.fillStyle = textColor;
    ctx.font = (isCat || emphasized ? '700 ' : '500 ') + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(truncate(node.label, isCat ? 22 : 16), x, y + r + 3 * scale);

    ctx.globalAlpha = 1;
  }

  function drawDetailNode(ctx, x, y, scale, node, alpha, isDark) {
    var r = 2.5 * scale;

    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = resolveColor(node, isDark);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function drawTaskSiteNode(ctx, x, y, scale, node, alpha, textColor, textSecondary, isDark, emphasized) {
    var r = 8 * scale * (emphasized ? 1.12 : 1);
    var color = isDark ? TASK_SITE_COLOR_DARK : TASK_SITE_COLOR;

    ctx.globalAlpha = alpha;

    if (emphasized) {
      ctx.beginPath();
      ctx.arc(x, y, r + 6 * scale, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, isDark ? 0.18 : 0.12);
      ctx.fill();
    }

    // Filled circle with teal color and dashed border
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.25);
    ctx.fill();
    ctx.setLineDash([3 * scale, 2 * scale]);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label below
    var fontSize = Math.max(8, Math.round(10 * scale));
    ctx.fillStyle = textColor;
    ctx.font = '500 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(truncate(node.label, 16), x, y + r + 3 * scale);

    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function roundRect(ctx, x, y, w, h, r) {
    if (r > h / 2) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1) + '…';
  }

  function resolveColor(node, isDark) {
    if (node.colorIndex !== undefined) {
      return isDark ? COLORS_DARK[node.colorIndex] : COLORS[node.colorIndex];
    }
    return node.color || '#94a3b8';
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isHighlighted(node, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    var label = (node.label || '').toLowerCase();
    var full = (node.fullLabel || '').toLowerCase();
    var cat = (node.categoryName || '').toLowerCase();
    return label.indexOf(q) !== -1 || full.indexOf(q) !== -1 || cat.indexOf(q) !== -1;
  }

  function getDefaultZoom(container, detailLevel) {
    if (!container || !container.getBoundingClientRect) return 1;
    var rect = container.getBoundingClientRect();
    var w = rect.width || container.clientWidth || 940;
    var h = rect.height || container.clientHeight || 520;
    var expanded = detailLevel === 'full';

    // Desktop keeps the reference framing. Smaller viewports pull the 3D
    // shell back so the graph reads as a map instead of clipped fragments.
    if (w >= 760 && h >= 460) return expanded ? 0.82 : 1;

    var targetW = expanded ? 760 : 520;
    var targetH = expanded ? 560 : 430;
    var minZoom = expanded ? 0.46 : 0.62;
    var zoom = Math.min(w / targetW, h / targetH);
    return Math.max(minZoom, Math.min(1, zoom));
  }

  function getFitZoom(state, detailLevel) {
    var defaultZoom = getDefaultZoom(state.container, detailLevel);
    if (!state || detailLevel !== 'full' || !state.canvas || !state.nodes || state.nodes.length === 0) {
      return defaultZoom;
    }

    var w = state.canvas.width / state.dpr;
    var h = state.canvas.height / state.dpr;
    if (!w || !h) return defaultZoom;

    var cx = w / 2;
    var cy = h / 2;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      var p = project(n.x3d, n.y3d, n.z3d, state.rotY, state.rotX, 1, cx, cy);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return defaultZoom;
    }

    var halfGraphW = Math.max(maxX - cx, cx - minX);
    var halfGraphH = Math.max(maxY - cy, cy - minY);
    if (halfGraphW <= 0 || halfGraphH <= 0) return defaultZoom;

    var marginX = Math.min(72, Math.max(36, w * 0.07));
    var marginY = Math.min(58, Math.max(32, h * 0.09));
    var fitZoom = Math.min((w / 2 - marginX) / halfGraphW, (h / 2 - marginY) / halfGraphH);
    var minZoom = w >= 760 && h >= 460 ? 0.6 : 0.42;
    return Math.max(minZoom, Math.min(defaultZoom, fitZoom));
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateZoomTo(state, targetZoom, duration) {
    if (!state) return;
    targetZoom = Math.max(0.3, Math.min(3.0, targetZoom));
    if (state.zoomAnimId) {
      cancelAnimationFrame(state.zoomAnimId);
      state.zoomAnimId = null;
    }

    var startZoom = state.zoom;
    if (Math.abs(startZoom - targetZoom) < 0.005) {
      state.zoom = targetZoom;
      return;
    }

    var startTime = performance.now();
    function step(now) {
      if (!state.running) return;
      var t = Math.min(1, (now - startTime) / duration);
      state.zoom = startZoom + (targetZoom - startZoom) * easeOutCubic(t);
      if (t < 1) {
        state.zoomAnimId = requestAnimationFrame(step);
      } else {
        state.zoom = targetZoom;
        state.zoomAnimId = null;
      }
    }
    state.zoomAnimId = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------
  function animate(state) {
    if (!state.running) return;

    // Pause when tab not visible
    if (document.hidden) {
      state.animId = requestAnimationFrame(function () { animate(state); });
      return;
    }

    state.time = performance.now();

    // Auto-orbit
    if (!state.isDragging) {
      state.rotY += 0.001;
      // Apply drag momentum
      state.rotY += state.momentumX;
      state.rotX += state.momentumY;
      state.momentumX *= 0.95;
      state.momentumY *= 0.95;
      if (Math.abs(state.momentumX) < 0.00001) state.momentumX = 0;
      if (Math.abs(state.momentumY) < 0.00001) state.momentumY = 0;
    }

    // Clamp pitch
    state.rotX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, state.rotX));

    renderFrame(state);

    state.animId = requestAnimationFrame(function () { animate(state); });
  }

  // ---------------------------------------------------------------
  // Interaction handlers
  // ---------------------------------------------------------------
  function setupInteraction(state) {
    var canvas = state.canvas;
    var container = state.container;

    // Drag
    canvas.addEventListener('mousedown', function (e) {
      state.isDragging = true;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      state.dragRotYStart = state.rotY;
      state.dragRotXStart = state.rotX;
      state.lastDragX = e.clientX;
      state.lastDragY = e.clientY;
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', function (e) {
      if (state.isDragging) {
        var dx = e.clientX - state.dragStartX;
        var dy = e.clientY - state.dragStartY;
        state.rotY = state.dragRotYStart + dx * 0.005;
        state.rotX = state.dragRotXStart + dy * 0.005;

        // Track momentum
        state.momentumX = (e.clientX - state.lastDragX) * 0.002;
        state.momentumY = (e.clientY - state.lastDragY) * 0.002;
        state.lastDragX = e.clientX;
        state.lastDragY = e.clientY;
      } else {
        // Hover hit test
        handleHover(state, e);
      }
    });

    canvas.addEventListener('mouseup', function () {
      if (state.isDragging) {
        state.isDragging = false;
        canvas.style.cursor = 'grab';
      }
    });

    canvas.addEventListener('mouseleave', function () {
      state.isDragging = false;
      canvas.style.cursor = 'grab';
      hideTooltip(state);
    });

    // Scroll zoom
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      // User zoom takes over: cancel any in-flight detail-level fit animation
      // so its step() stops overwriting state.zoom.
      if (state.zoomAnimId) {
        cancelAnimationFrame(state.zoomAnimId);
        state.zoomAnimId = null;
      }
      var delta = e.deltaY > 0 ? -0.08 : 0.08;
      state.zoom = Math.max(0.3, Math.min(3.0, state.zoom + delta));
      state.userZoomed = true;
    }, { passive: false });

    // Touch support
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        var touch = e.touches[0];
        state.isDragging = true;
        state.dragStartX = touch.clientX;
        state.dragStartY = touch.clientY;
        state.dragRotYStart = state.rotY;
        state.dragRotXStart = state.rotX;
        state.lastDragX = touch.clientX;
        state.lastDragY = touch.clientY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (state.isDragging && e.touches.length === 1) {
        e.preventDefault();
        var touch = e.touches[0];
        var dx = touch.clientX - state.dragStartX;
        var dy = touch.clientY - state.dragStartY;
        state.rotY = state.dragRotYStart + dx * 0.005;
        state.rotX = state.dragRotXStart + dy * 0.005;
        state.momentumX = (touch.clientX - state.lastDragX) * 0.002;
        state.momentumY = (touch.clientY - state.lastDragY) * 0.002;
        state.lastDragX = touch.clientX;
        state.lastDragY = touch.clientY;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function () {
      state.isDragging = false;
    }, { passive: true });
  }

  // ---------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------
  function handleHover(state, e) {
    if (!state.projected || state.projected.length === 0) return;

    var rect = state.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    // Find nearest node within hit radius
    var best = null;
    var bestDist = Infinity;

    for (var i = state.projected.length - 1; i >= 0; i--) {
      var p = state.projected[i];
      var hitR = 15;
      if (p.node.type === 'root') hitR = 30 * p.scale;
      else if (p.node.type === 'site' || p.node.type === 'task-site') hitR = 18 * p.scale;
      else hitR = 8 * p.scale;

      var dx = mx - p.x;
      var dy = my - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitR && dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }

    if (best && best.node.type !== 'root') {
      showTooltip(state, best.node, e);
    } else {
      hideTooltip(state);
    }
  }

  function showTooltip(state, node, e) {
    var tooltip = state.tooltip;
    if (!tooltip) return;

    var html = '';
    if (node.isCat) {
      html = '<strong>' + escapeHtml(node.label) + '</strong>';
      html += '<br><span style="opacity:0.7">' + (node.siteCount || 0) + ' sites</span>';
    } else if (node.type === 'site' || node.type === 'task-site') {
      html = '<strong>' + escapeHtml(node.label) + '</strong>';
      if (node.categoryName) html += '<br><span style="opacity:0.6">' + escapeHtml(node.categoryName) + '</span>';
      var meta = [];
      if (node.selectorCount > 0) meta.push(node.selectorCount + ' selectors');
      if (node.workflowCount > 0) meta.push(node.workflowCount + ' workflows');
      if (node.warningCount > 0) meta.push(node.warningCount + ' warnings');
      if (node.type === 'task-site') meta.push('task-discovered');
      if (meta.length > 0) html += '<br>' + meta.join(' | ');
    } else if (node.type === 'detail') {
      html = '<strong>' + escapeHtml(node.label) + '</strong>';
      html += '<br><span style="opacity:0.7">' + (node.detailType || 'detail') + '</span>';
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    var containerRect = state.container.getBoundingClientRect();
    var tx = e.clientX - containerRect.left + 14;
    var ty = e.clientY - containerRect.top - 12;
    if (tx + 280 > containerRect.width) tx = e.clientX - containerRect.left - 290;
    if (ty < 0) ty = 10;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  }

  function hideTooltip(state) {
    if (state.tooltip) state.tooltip.style.display = 'none';
  }

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------
  function render(container, options) {
    if (!container) return;
    destroy(container);

    var opts = Object.assign({
      detailLevel: 'simple'
    }, options || {});

    // Build data
    var data = buildKnowledgeGraphData(opts.detailLevel);
    if (data.nodes.length === 0) return;

    // Create canvas -- use CSS for layout, then sync buffer size
    var canvas = document.createElement('canvas');
    canvas.className = 'knowledge-graph-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.cursor = 'grab';
    container.appendChild(canvas);

    var dpr = window.devicePixelRatio || 1;

    // Sync the pixel buffer to the actual rendered size
    function syncCanvasSize() {
      var rect = canvas.getBoundingClientRect();
      var bw = Math.round(rect.width * dpr);
      var bh = Math.round(rect.height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
    }
    syncCanvasSize();

    var ctx = canvas.getContext('2d');

    // Tooltip
    var tooltip = document.createElement('div');
    tooltip.className = 'knowledge-graph-tooltip';
    container.appendChild(tooltip);

    // State object
    var state = {
      container: container,
      canvas: canvas,
      ctx: ctx,
      dpr: dpr,
      nodes: data.nodes,
      links: data.links,
      detailLevel: opts.detailLevel,
      rotY: 0,
      rotX: 0.15,
      zoom: typeof opts.initialZoom === 'number' ? opts.initialZoom : getDefaultZoom(container, opts.detailLevel),
      userZoomed: typeof opts.initialZoom === 'number',
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragRotYStart: 0,
      dragRotXStart: 0,
      lastDragX: 0,
      lastDragY: 0,
      momentumX: 0,
      momentumY: 0,
      zoomAnimId: null,
      time: 0,
      running: true,
      animId: null,
      projected: [],
      tooltip: tooltip,
      highlightQuery: ''
    };

    _state = state;
    container._knowledgeGraphState = state;

    // Handle resize -- re-sync canvas buffer to CSS layout
    state._syncCanvasSize = syncCanvasSize;
    state._resizeHandler = function () {
      syncCanvasSize();
      if (!state.userZoomed) state.zoom = getDefaultZoom(container, state.detailLevel);
    };
    window.addEventListener('resize', state._resizeHandler);

    setupInteraction(state);
    animate(state);
  }

  function destroy(container) {
    if (!container) return;
    var state = container._knowledgeGraphState;
    if (state) {
      state.running = false;
      if (state.animId) cancelAnimationFrame(state.animId);
      if (state.zoomAnimId) cancelAnimationFrame(state.zoomAnimId);
      if (state._resizeHandler) window.removeEventListener('resize', state._resizeHandler);
      if (state.canvas) state.canvas.remove();
      if (state.tooltip) state.tooltip.remove();
      delete container._knowledgeGraphState;
    }
    if (_state && _state.container === container) _state = null;
  }

  function refresh() {
    if (!_state) return;
    var data = buildKnowledgeGraphData(_state.detailLevel);
    _state.nodes = data.nodes;
    _state.links = data.links;
  }

  function setDetailLevel(level) {
    if (!_state) return;
    _state.detailLevel = level;
    var data = buildKnowledgeGraphData(level);
    _state.nodes = data.nodes;
    _state.links = data.links;
    if (level === 'full') {
      _state.userZoomed = false;
      animateZoomTo(_state, getFitZoom(_state, level), 650);
    } else if (!_state.userZoomed) {
      animateZoomTo(_state, getDefaultZoom(_state.container, level), 420);
    }
  }

  function highlight(query) {
    if (!_state) return;
    _state.highlightQuery = (query || '').trim();
  }

  function setTaskMemories(memories) {
    _taskMemories = memories || [];
    if (_state) refresh(); // auto-refresh if already rendered
  }

  return {
    render: render,
    destroy: destroy,
    refresh: refresh,
    setDetailLevel: setDetailLevel,
    highlight: highlight,
    setTaskMemories: setTaskMemories
  };
})();

if (typeof self !== 'undefined') {
  self.KnowledgeGraph = KnowledgeGraph;
}
