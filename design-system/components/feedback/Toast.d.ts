import * as React from 'react';

/**
 * Bottom-center confirmation pill. Orange border and glow, rises 18px as it fades in.
 * @startingPoint section="Feedback" subtitle="Bottom-center confirmation pill" viewport="700x150"
 */
export interface ToastProps {
  open?: boolean;
  /** Leading glyph. Defaults to a check. */
  icon?: React.ReactNode;
  /** Trailing mono value, e.g. the token that was copied. */
  code?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Toast(props: ToastProps): React.ReactElement;
