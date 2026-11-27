import React from 'react';

export function Checkbox({ checked = false, onChange, label, disabled, style, ...rest }) {
  const box = {
    width: 22, height: 22, borderRadius: 6,
    border: '1px solid ' + (checked ? 'transparent' : 'var(--border-color)'),
    background: checked ? 'var(--primary-gradient)' : 'var(--bg-body)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: checked ? '#fff' : 'transparent', fontSize: '0.68rem', flexShrink: 0,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
    transition: 'background var(--transition-fast), border-color var(--transition-fast)',
  };
  const el = (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange && onChange(!checked)}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChange && onChange(!checked); } }}
      style={{ ...box, ...style }}
      {...rest}
    >
      <i className="fa-solid fa-check" />
    </span>
  );
  if (!label) return el;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {el}
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
    </span>
  );
}
