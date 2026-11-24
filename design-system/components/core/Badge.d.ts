import * as React from 'react';

/**
 * Status, category and technical pills. Seven variants covering the whole site vocabulary.
 * @startingPoint section="Core" subtitle="Seven pill variants" viewport="700x150"
 */
export interface BadgeProps {
  /**
   * eyebrow — section kicker, orange wash pill.
   * fsb — solid orange product tag.
   * competitor — red comparison tag.
   * recommended — solid orange uppercase flag on provider cards.
   * nav — neutral chip for a site + path pair (use `meta` for the path).
   * selector — mono DOM selector chip.
   * tool — mono capability/tool-call chip in orange.
   * @default "eyebrow"
   */
  variant?: 'eyebrow' | 'fsb' | 'competitor' | 'recommended' | 'nav' | 'selector' | 'tool';
  icon?: React.ReactNode;
  /** Trailing mono detail — the path half of a `nav` chip. */
  meta?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Badge(props: BadgeProps): React.ReactElement;
