/* The dashboard reads two globals that plain scripts define, FSBDashboardRuntimeState
   and FSBPhantomStreamViewer. No other page uses them, so they are fetched when the
   dashboard route is opened instead of by every page of the site. */
const RUNTIME_SCRIPTS = ['assets/dashboard-runtime-state.js', 'assets/phantom-stream-viewer.js'];

type RuntimeWindow = Window & { FSBDashboardRuntimeState?: unknown; FSBPhantomStreamViewer?: unknown };

let pending: Promise<void> | null = null;

function ready(win: RuntimeWindow | null): boolean {
  return !!win && !!win.FSBDashboardRuntimeState && !!win.FSBPhantomStreamViewer;
}

/** Resolves once both scripts have run (or failed: the dashboard reports a missing viewer itself). */
export function loadDashboardRuntime(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): Promise<void> {
  if (!doc || ready(doc.defaultView)) return Promise.resolve();
  pending ??= Promise.all(
    RUNTIME_SCRIPTS.map(
      src =>
        new Promise<void>(resolve => {
          const script = doc.createElement('script');
          script.src = src;
          // Fetched together, run in the order above: the viewer expects the state helpers.
          script.async = false;
          script.onload = script.onerror = () => resolve();
          doc.body.appendChild(script);
        }),
    ),
  ).then(() => {
    // A failed fetch is tried again the next time the dashboard is opened.
    if (!ready(doc.defaultView)) pending = null;
  });
  return pending;
}
