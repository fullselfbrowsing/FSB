import * as React from 'react';

/** Label + control + hint wrapper. */
export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Field(props: FieldProps): React.ReactElement;
