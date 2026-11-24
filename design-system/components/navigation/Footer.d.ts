import * as React from 'react';

/** Four-column site footer: mark and byline left, link columns right, legal strip below. */
export interface FooterProps {
  columns?: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
  /** Optional attribution line. The shipped site footer has none, so leave it unset. */
  byline?: React.ReactNode;
  /** Version tag shown beside the mark. */
  version?: string;
  bottomLinks?: Array<{ label: string; href: string }>;
  style?: React.CSSProperties;
}

export declare function Footer(props: FooterProps): React.ReactElement;
