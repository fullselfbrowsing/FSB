import * as React from 'react';

/**
 * The site's four card recipes. All share a quiet surface, hairline border and lift-on-hover.
 * @startingPoint section="Core" subtitle="Feature, provider, competitor and highlight cards" viewport="700x260"
 */
export interface CardProps {
  /**
   * feature — icon tile + heading + body, two-up grid.
   * provider — centered model/provider tile, optionally recommended.
   * competitor — dimmed comparison tile that brightens on hover.
   * highlight — orange-bordered glowing panel for the FSB side of a comparison.
   * @default "feature"
   */
  variant?: 'feature' | 'provider' | 'competitor' | 'highlight';
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** Trailing badge element, e.g. a competitor `Vision` tag. */
  badge?: React.ReactNode;
  /** Adds the orange border, glow and "Recommended" flag. Provider variant only. */
  recommended?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Card(props: CardProps): React.ReactElement;
