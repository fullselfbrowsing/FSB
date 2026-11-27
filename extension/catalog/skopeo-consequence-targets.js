(function(global) {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) { return value; }
    Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var contracts = {
    'slack.chat.postMessage': {
      effectLabel: 'Send one message',
      progressLabel: 'Sending one message',
      targetRoles: [
        { field: 'channel', label: 'Slack channel', render: 'scalar', maxLength: 128 }
      ],
      materialRoles: [
        { field: 'text', label: 'Message', render: 'scalar', maxLength: 256 }
      ],
      excludedFromCollection: []
    },
    'notion.create_page': {
      effectLabel: 'Create one page',
      progressLabel: 'Creating one page',
      targetRoles: [
        { field: 'title', label: 'New page title', render: 'scalar', maxLength: 128 },
        { field: 'parent_page_id', label: 'Parent page ID', render: 'scalar', maxLength: 128 }
      ],
      materialRoles: [
        { field: 'title', label: 'Page title', render: 'scalar', maxLength: 128 },
        { field: 'icon', label: 'Page icon', render: 'scalar', maxLength: 256 },
        { field: 'content', label: 'Page content', render: 'scalar', maxLength: 256 }
      ],
      excludedFromCollection: []
    },
    'notion.update_page': {
      effectLabel: 'Update one page',
      progressLabel: 'Updating one page',
      targetRoles: [
        { field: 'page_id', label: 'Page ID', render: 'scalar', maxLength: 128 }
      ],
      materialRoles: [
        { field: 'page_id', label: 'Updated page ID', render: 'scalar', maxLength: 128 },
        { field: 'title', label: 'New title', render: 'scalar', maxLength: 128 },
        { field: 'icon', label: 'Page icon', render: 'scalar', maxLength: 256 },
        { field: 'cover', label: 'Page cover', render: 'scalar', maxLength: 256 }
      ],
      excludedFromCollection: []
    },
    'notion.create_database': {
      effectLabel: 'Create one database',
      progressLabel: 'Creating one database',
      targetRoles: [
        { field: 'parent_page_id', label: 'Parent page ID', render: 'scalar', maxLength: 128 }
      ],
      materialRoles: [
        { field: 'title', label: 'Database title', render: 'scalar', maxLength: 128 }
      ],
      excludedFromCollection: []
    },
    'notion.create_database_item': {
      effectLabel: 'Create one database item',
      progressLabel: 'Creating one database item',
      targetRoles: [
        { field: 'database_id', label: 'Database ID', render: 'scalar', maxLength: 128 }
      ],
      materialRoles: [
        { field: 'title', label: 'Item title', render: 'scalar', maxLength: 128 }
      ],
      excludedFromCollection: []
    }
  };

  contracts = deepFreeze(contracts);

  function getContract(slug) {
    return typeof slug === 'string' && Object.prototype.hasOwnProperty.call(contracts, slug)
      ? contracts[slug]
      : null;
  }

  var api = deepFreeze({
    schemaVersion: 1,
    contracts: contracts,
    getContract: getContract
  });

  global.FsbSkopeoConsequenceTargets = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
