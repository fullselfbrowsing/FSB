import * as React from 'react';

/** Mono version string with wide tracking, prefixed with the ▽ glyph. */
export interface VersionTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default "▽X.Y.Z" */
  children?: React.ReactNode;
  /** @default "0.85rem" */
  size?: string;
}

export declare function VersionTag(props: VersionTagProps): React.ReactElement;
