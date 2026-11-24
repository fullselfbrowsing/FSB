import React from 'react';

export function Input({ style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <input
      onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
      style={{ ...{
  width: '100%',
  padding: '11px 14px',
  background: 'var(--bg-body)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color var(--transition-fast)',
}, ...(focus ? { borderColor: 'var(--primary)' } : null), ...style }}
      {...rest}
    />
  );
}
