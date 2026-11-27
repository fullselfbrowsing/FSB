import * as React from 'react';

/** Multi-line field for task descriptions. Vertical resize, 80px floor. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  style?: React.CSSProperties;
}

export declare function Textarea(props: TextareaProps): React.ReactElement;
