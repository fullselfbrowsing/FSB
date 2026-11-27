import * as React from 'react';

/** Native select with a suppressed chrome arrow and a Font Awesome chevron. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Strings, or `{ value, label }` pairs. Ignored when children are passed. */
  options?: Array<string | { value: string; label: string }>;
  style?: React.CSSProperties;
}

export declare function Select(props: SelectProps): React.ReactElement;
