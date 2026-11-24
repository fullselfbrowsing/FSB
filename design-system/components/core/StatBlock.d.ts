import * as React from 'react';

/** A row of hard numbers in orange. The proof half of every claim. */
export interface StatBlockProps {
  stats?: Array<{ value: React.ReactNode; label: React.ReactNode }>;
  /** Gap between stats in px. @default 40 */
  gap?: number;
  style?: React.CSSProperties;
}

export declare function StatBlock(props: StatBlockProps): React.ReactElement;
