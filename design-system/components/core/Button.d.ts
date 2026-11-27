import * as React from 'react';

/**
 * Primary action control. Three intents, two sizes, 2px lift on hover.
 * @startingPoint section="Core" subtitle="Primary, outline and GitHub intents" viewport="700x150"
 */
export interface ButtonProps {
  /** Gradient primary, orange outline, or neutral GitHub style. @default "primary" */
  variant?: 'primary' | 'outline' | 'github';
  /** @default "md" */
  size?: 'md' | 'sm';
  /** Leading icon element, usually an `<i>` Font Awesome glyph. */
  icon?: React.ReactNode;
  /** Renders an anchor instead of a button. */
  href?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Button(props: ButtonProps): React.ReactElement;
