import * as React from 'react';

/** Binary switch. Gradient track when on, 20px knob. */
export interface ToggleProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Optional inline label to the right of the track. */
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export declare function Toggle(props: ToggleProps): React.ReactElement;
