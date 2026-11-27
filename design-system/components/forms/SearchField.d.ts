import * as React from 'react';

/** Pill-shaped search input with a leading magnifier. Capped at 340px by default. */
export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** @default 340 */
  maxWidth?: number | string;
  style?: React.CSSProperties;
}

export declare function SearchField(props: SearchFieldProps): React.ReactElement;
