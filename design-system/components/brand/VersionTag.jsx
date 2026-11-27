import React from 'react';

export function VersionTag({ children = '\u25bdX.Y.Z', size = '0.85rem', style, ...rest }) {
  return (
    <span
      translate="no"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: size,
        letterSpacing: 'var(--tracking-version)',
        color: 'var(--text-muted)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
