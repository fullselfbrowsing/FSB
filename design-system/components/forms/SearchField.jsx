import React from 'react';

export function SearchField({ maxWidth = 340, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'block', maxWidth, ...style }}>
      <i
        className="fa-solid fa-magnifying-glass"
        style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}
      />
      <input
        onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
        style={{
          width: '100%', padding: '10px 14px 10px 36px', background: 'var(--bg-body)',
          border: '1px solid ' + (focus ? 'var(--primary)' : 'var(--border-color)'),
          borderRadius: 'var(--radius-pill)', color: 'var(--text-primary)',
          fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
          transition: 'border-color var(--transition-fast)',
        }}
        {...rest}
      />
    </span>
  );
}
