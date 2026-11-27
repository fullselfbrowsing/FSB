import React from 'react';

export function Select({ options = [], children, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <select
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
}, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', paddingRight: 36, ...(focus ? { borderColor: 'var(--primary)' } : null), ...style }}
        {...rest}
      >
        {children || options.map((o) => (
          typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <i
        className="fa-solid fa-chevron-down"
        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.72rem', pointerEvents: 'none' }}
      />
    </span>
  );
}
