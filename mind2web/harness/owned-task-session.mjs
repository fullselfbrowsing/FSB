function textData(result) {
  return (result?.content ?? []).filter(x => x.type === 'text').map(x => { try { return JSON.parse(x.text); } catch { return {}; } });
}
export function ownedTabsFromResult(result) {
  const data = textData(result);
  const row = data.find(x => Array.isArray(x.tabs));
  if (result?.isError || !row || row.success === false) throw Object.assign(new Error('Authoritative scoped tab inventory failed'), { code: 'OWNED_INVENTORY_FAILED' });
  return row.tabs.map(tab => ({ ...tab, id: tab.id ?? tab.tabId ?? tab.tab_id })).filter(tab => Number.isInteger(tab.id));
}

export class OwnedTaskSession {
  constructor({ maxTabs = 8 } = {}) { this.maxTabs = maxTabs; this.tabs = new Map(); this.selectedTabId = null; this.primaryTabId = null; this.frames = new Map(); this.foreign = new Map(); }
  // The public release can list a task's popup while assigning it to another
  // agent; such a tab can be read but never focused, targeted or closed here.
  markForeign(id, nativeError) {
    this.foreign.set(id, { tab_id: id, native_error: nativeError ?? null, marked_at: new Date().toISOString() });
    this.tabs.delete(id); this.frames.delete(id);
    if (this.selectedTabId === id) this.selectedTabId = this.tabs.has(this.primaryTabId) ? this.primaryTabId : [...this.tabs.keys()][0] ?? null;
  }
  registerOpenedTab(id) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('FSB did not return an owned tab ID');
    this.tabs.set(id, { id }); this.selectedTabId = id; this.primaryTabId ??= id;
  }
  syncOwnedChildren(result) {
    const rows = ownedTabsFromResult(result).filter(tab => !this.foreign.has(tab.id));
    this.tabs = new Map(rows.map(tab => [tab.id, tab]));
    for (const id of this.frames.keys()) if (!this.tabs.has(id)) this.frames.delete(id);
    if (!this.tabs.has(this.selectedTabId)) this.selectedTabId = this.tabs.has(this.primaryTabId) ? this.primaryTabId : rows[0]?.id ?? null;
    return rows;
  }
  resolveTarget(args = {}, { allowForeign = false } = {}) {
    if (args.tab_id !== undefined && args.tabId !== undefined && args.tab_id !== args.tabId) throw Object.assign(new Error('Conflicting tab targets'), { code: 'TAB_TARGET_CONFLICT' });
    const id = args.tab_id ?? args.tabId ?? this.selectedTabId;
    if (this.foreign.has(id) && allowForeign) return id;
    if (this.foreign.has(id)) throw Object.assign(new Error('FSB lists this tab but assigns it to another agent, so this task cannot focus, target or close it: '
      + (this.foreign.get(id).native_error ?? 'Tab ownership')), { code: 'PUBLIC_TAB_NOT_CONTROLLABLE' });
    if (!this.tabs.has(id)) throw Object.assign(new Error('Target tab is not owned by this task; use list_tabs to inspect owned children'), { code: 'TAB_NOT_OWNED' });
    return id;
  }
  selectTab(id) { this.resolveTarget({ tab_id: id }); this.selectedTabId = id; }
  assertCanOpen() { if (this.tabs.size >= this.maxTabs) throw Object.assign(new Error(`This task is limited to ${this.maxTabs} owned tabs`), { code: 'TASK_TAB_LIMIT' }); }
  assertCanClose(id) {
    this.resolveTarget({ tab_id: id });
    if (this.tabs.size <= 1) throw Object.assign(new Error('Keep the last working tab open until task finalization'), { code: 'LAST_WORKING_TAB' });
  }
  latestFrame(id) { return this.frames.get(id) ?? null; }
  rememberFrame(receipt) { this.frames.set(receipt.tab_id, receipt); }
}
