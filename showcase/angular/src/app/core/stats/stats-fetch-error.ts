import type {
  DatasetAvailability,
  DatasetFailureMetadata,
} from './dataset-state.types';

/** A failed HTTP response with transport metadata preserved for the UI. */
export class StatsFetchError extends Error {
  override readonly name = 'StatsFetchError';

  constructor(
    message: string,
    readonly failure: DatasetFailureMetadata
  ) {
    super(message);
  }
}

/** Parse either Retry-After seconds or an HTTP-date into an absolute time. */
export function retryAfterTimestamp(
  retryAfter: string | null,
  checkedAt: number
): number | undefined {
  if (retryAfter === null) return undefined;
  const trimmed = retryAfter.trim();
  if (trimmed.length === 0) return undefined;

  const seconds = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (Number.isFinite(seconds)) {
    return checkedAt + seconds * 1000;
  }

  const parsedDate = Date.parse(trimmed);
  return Number.isFinite(parsedDate) ? Math.max(checkedAt, parsedDate) : undefined;
}

export function httpStatsFetchError(
  message: string,
  status: number,
  retryAfter: string | null,
  checkedAt = Date.now()
): StatsFetchError {
  const nextRetryAt = retryAfterTimestamp(retryAfter, checkedAt);
  return new StatsFetchError(message, {
    checkedAt,
    upstreamStatus: String(status),
    ...(nextRetryAt === undefined ? {} : { nextRetryAt }),
  });
}

/** Preserve the snapshot while replacing metadata with the failed check. */
export function availabilityAfterFailure(
  previous: DatasetAvailability,
  error: unknown,
  checkedAt = Date.now()
): DatasetAvailability {
  const failure = statsFailureMetadata(error, checkedAt);
  return {
    snapshotAt: previous.snapshotAt,
    checkedAt: failure.checkedAt,
    upstreamStatus: failure.upstreamStatus,
    ...(failure.nextRetryAt === undefined ? {} : { nextRetryAt: failure.nextRetryAt }),
  };
}

export function statsFailureMetadata(
  error: unknown,
  checkedAt = Date.now()
): DatasetFailureMetadata {
  return error instanceof StatsFetchError
    ? error.failure
    : { checkedAt, upstreamStatus: 'request-error' };
}
