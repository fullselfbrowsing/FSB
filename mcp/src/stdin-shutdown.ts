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

export interface StdoutLike {
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown;
}

const BROKEN_PIPE_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED', 'ECONNRESET']);

/**
 * When the host closes its end of the pipe while a response is still being
 * written, Node emits an `error` (EPIPE) on stdout. With no listener that is an
 * uncaught exception and the server crashes with a stack trace. Treat a broken
 * pipe as the host going away: call `onBrokenPipe` exactly once. Any other
 * stdout error is reported to `onOtherError` (rethrown by default).
 *
 * Returns the listener that was attached, for tests.
 */
export function shutdownOnBrokenStdout(
  stdout: StdoutLike,
  onBrokenPipe: () => void,
  onOtherError: (err: NodeJS.ErrnoException) => void = (err) => { throw err; },
): (err: NodeJS.ErrnoException) => void {
  let fired = false;
  const listener = (err: NodeJS.ErrnoException): void => {
    if (err && typeof err.code === 'string' && BROKEN_PIPE_CODES.has(err.code)) {
      if (fired) return;
      fired = true;
      onBrokenPipe();
      return;
    }
    onOtherError(err);
  };
  stdout.on('error', listener);
  return listener;
}
