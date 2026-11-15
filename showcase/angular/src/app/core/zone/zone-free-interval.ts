interface ZoneLike {
  run<T>(fn: () => T): T;
}

/**
 * `setInterval` that does not keep the application "unstable".
 *
 * A timer that repeats forever inside the Angular zone counts as pending work for as
 * long as it lives, so the app never reports stable, and hydration waits on that
 * before it finishes. The timer here is created in the root zone, where Angular does
 * not track it; each tick is still run in the zone the caller was in, so change
 * detection follows a tick exactly as it does with a plain `setInterval`.
 */
export function setZoneFreeInterval(tick: () => void, ms: number): number {
  const zone = (globalThis as { Zone?: { current: ZoneLike; root: ZoneLike } }).Zone;
  if (!zone) return window.setInterval(tick, ms);
  const callerZone = zone.current;
  return zone.root.run(() => window.setInterval(() => callerZone.run(tick), ms));
}
