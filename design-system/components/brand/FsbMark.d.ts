import * as React from 'react';

/**
 * The FSB wordmark lockup.
 * @startingPoint section="Brand" subtitle="Wordmark lockup with optional version tag" viewport="700x150"
 */
export interface FsbMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Overall mark size. Nav uses 1.5rem, footer 1.32rem. @default "1.5rem" */
  size?: string;
  /** Optional version tag rendered in mono beside the mark, e.g. "▽X.Y.Z". */
  version?: string;
  /** Override the inherited color. Prefer inheriting. */
  color?: string;
}

export declare function FsbMark(props: FsbMarkProps): React.ReactElement;
