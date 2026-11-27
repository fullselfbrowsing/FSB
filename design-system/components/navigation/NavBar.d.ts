import * as React from 'react';

/**
 * Fixed, blurred top bar. Mark left, links center, one action right.
 * @startingPoint section="Navigation" subtitle="Fixed blurred top bar and four-column footer" viewport="1200x420"
 */
export interface NavBarProps {
  links?: Array<{ label: string; href: string }>;
  /** Label of the current page — gets the 2px orange underline. */
  active?: string;
  /** Intercepts link clicks for client-side routing. */
  onNavigate?: (link: { label: string; href: string }) => void;
  /** Right-hand slot. Defaults to a small GitHub button; pass `null` for none. */
  action?: React.ReactNode;
  /** @default true */
  fixed?: boolean;
  style?: React.CSSProperties;
}

export declare function NavBar(props: NavBarProps): React.ReactElement;
