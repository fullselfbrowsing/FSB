import * as React from 'react';

/** Section kicker + heading + deck. Opens every major block on a page. */
export interface SectionHeaderProps {
  /** Mono section number in orange, e.g. "01". */
  num?: string;
  /** Uppercase mono kicker with wide tracking. Use instead of `num` on marketing pages. */
  eyebrow?: string;
  title: React.ReactNode;
  /** Deck copy, capped at 640px. */
  children?: React.ReactNode;
  /** @default "left" */
  align?: 'left' | 'center';
  style?: React.CSSProperties;
}

export declare function SectionHeader(props: SectionHeaderProps): React.ReactElement;
