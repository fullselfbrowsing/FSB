/**
 * The bridge holds a libuv handle open for the life of the process -- a
 * listening http.Server in hub mode, an open client socket in relay mode -- so
 * the event loop never drains on its own. A host that exits by closing the
 * pipe, or that is killed without signalling its children, otherwise leaves a
 * fully functional server running forever. Because port ownership is decided
 * once by a bind race and never re-attempted, the bridge hub then becomes the
 * oldest surviving orphan rather than a process anyone is still talking to.
 */

export interface StdinLike {
  readonly readableEnded?: boolean;
  readonly destroyed?: boolean;
  on(event: 'end' | 'close', listener: () => void): unknown;
  resume(): unknown;
}

/**
 * Call `onEnd` exactly once when the host closes stdin.
 *
 * Returns true when stdin had already ended and `onEnd` ran synchronously --
 * stdin can reach EOF while the bridge is still connecting, and a listener
 * attached after the fact would never fire.
 */
export function shutdownWhenStdinEnds(stdin: StdinLike, onEnd: () => void): boolean {
  let fired = false;
  const fire = (): void => {
    if (fired) return;
    fired = true;
    onEnd();
  };

  if (stdin.readableEnded || stdin.destroyed) {
    fire();
    return true;
  }
  stdin.on('end', fire);
  stdin.on('close', fire);
  stdin.resume();
  return false;
}
