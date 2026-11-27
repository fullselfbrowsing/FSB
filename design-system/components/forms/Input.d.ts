import * as React from 'react';

/**
 * Single-line text field. Focus lands on the orange accent.
 * @startingPoint section="Forms" subtitle="Inputs, select, toggle and checkbox" viewport="700x300"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  style?: React.CSSProperties;
}

export declare function Input(props: InputProps): React.ReactElement;
