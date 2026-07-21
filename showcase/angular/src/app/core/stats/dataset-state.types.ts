/** Metadata describing a usable stats snapshot and the latest refresh check. */
export interface DatasetAvailability {
  /** Time represented by the usable snapshot. */
  snapshotAt: number | null;
  /** Time the source was most recently checked, whether or not it changed. */
  checkedAt: number;
  /** Upstream HTTP status, or a client-side failure label. */
  upstreamStatus: string;
  /** Earliest advertised retry time after a failed upstream check. */
  nextRetryAt?: number;
}

/** Metadata known when a refresh attempt fails. */
export interface DatasetFailureMetadata {
  checkedAt: number;
  upstreamStatus: string;
  nextRetryAt?: number;
}

/**
 * Transport state for one stats source.
 *
 * Freshness and coverage are intentionally not encoded in this union. A
 * ready state means only that a usable snapshot exists; the selected view
 * applies its own SLA to `availability.snapshotAt`.
 */
export type DatasetState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T; availability: DatasetAvailability }
  | { kind: 'error'; message: string; failure?: DatasetFailureMetadata };
