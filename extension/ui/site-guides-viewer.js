/**
 * Site Guides Viewer
 * Thin init wrapper that wires the consolidated 3D KnowledgeGraph
 * to the Memory tab's FSB Intelligence section.
 */

(function () {
  'use strict';

  function initSiteGuidesViewer() {
    // Update site count in header
    var totalCount = (typeof getTotalSiteCount === 'function') ? getTotalSiteCount() : 0;
    var countEl = document.getElementById('siteGuideCount');
    if (countEl) countEl.textContent = totalCount;

    // Count categories
    var catCount = 0;
    if (typeof getSiteGuidesByCategory === 'function') {
      catCount = Object.keys(getSiteGuidesByCategory()).length;
    }
    var catCountEl = document.getElementById('siteCategoryCount');
    if (catCountEl) catCountEl.textContent = catCount;

    // Render consolidated 3D knowledge graph
    var graphContainer = document.getElementById('knowledgeGraphContainer');
    if (graphContainer && typeof KnowledgeGraph !== 'undefined') {
      var savedLevel = localStorage.getItem('fsbKnowledgeDetailLevel') || 'simple';
      KnowledgeGraph.render(graphContainer, { detailLevel: savedLevel });

      // Feed Task Memory discoveries into knowledge graph
      if (typeof memoryManager !== 'undefined' && typeof KnowledgeGraph.setTaskMemories === 'function') {
        memoryManager.getAll().then(function(memories) {
          var taskMemories = memories.filter(function(m) { return m.type === 'task'; });
          if (taskMemories.length > 0) {
            KnowledgeGraph.setTaskMemories(taskMemories);
          }
        }).catch(function() { /* silently skip if no memories */ });
      }

      // Activate the correct toggle button
      var toggleBtns = document.querySelectorAll('#knowledgeDetailToggle .detail-btn');
      toggleBtns.forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.level === savedLevel);
      });
    }

    // Wire detail toggle (Overview / Expanded)
    var toggleContainer = document.getElementById('knowledgeDetailToggle');
    if (toggleContainer) {
      toggleContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('.detail-btn');
        if (!btn) return;
        var level = btn.dataset.level;
        var current = localStorage.getItem('fsbKnowledgeDetailLevel') || 'simple';
        if (level === current) return;

        localStorage.setItem('fsbKnowledgeDetailLevel', level);
        toggleContainer.querySelectorAll('.detail-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');

        if (typeof KnowledgeGraph !== 'undefined') {
          KnowledgeGraph.setDetailLevel(level);
        }
      });
    }

    // Wire search input to highlight
    var searchInput = document.getElementById('knowledgeGraphSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        if (typeof KnowledgeGraph !== 'undefined') {
          KnowledgeGraph.highlight(searchInput.value);
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteGuidesViewer);
  } else {
    initSiteGuidesViewer();
  }
})();
