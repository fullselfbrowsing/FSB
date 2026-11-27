import React from 'react';

/* Three-part lockup: hairline Poppins F, black Poppins S, custom-drawn B.
   Always inherits currentColor. Scale it with fontSize, never by recoloring parts. */
export function FsbMark({ size = '1.5rem', version, color, style, ...rest }) {
  return (
    <span
      translate="no"
      style={{ display: 'inline-block', lineHeight: 1, fontSize: size, color: color || 'inherit', ...style }}
      {...rest}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          letterSpacing: 'var(--tracking-tight)',
          fontFamily: 'var(--font-brand)',
          lineHeight: 1,
        }}
      >
        <span style={{ fontWeight: 100 }}>F</span>
        <span style={{ fontWeight: 900 }}>S</span>
        <svg
          viewBox="-3 -3 78 103"
          aria-hidden="true"
          style={{
            height: '0.74em',
            width: 'auto',
            fill: 'currentColor',
            display: 'inline-block',
            verticalAlign: 'baseline',
            marginLeft: '0.01em',
          }}
        >
          <path d="M0 0 L40 0 C58 0 70 10 70 26 C70 38 62 46 50 49 C64 51 72 60 72 74 C72 90 60 100 40 100 L0 100 Z"></path>
        </svg>
        {version ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.27em',
              letterSpacing: 'var(--tracking-version)',
              color: 'var(--text-muted)',
              marginTop: '0.2em',
              paddingLeft: '0.4em',
            }}
          >
            {version}
          </span>
        ) : null}
      </span>
    </span>
  );
}
