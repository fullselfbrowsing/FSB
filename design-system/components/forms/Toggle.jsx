import React from 'react';

export function Toggle({ checked = false, onChange, label, disabled, style, ...rest }) {
  const track = {
    position: 'relative', width: 46, height: 26, borderRadius: 'var(--radius-pill)',
    background: checked ? 'var(--primary-gradient)' : 'var(--bg-elevated)',
    border: '1px solid ' + (checked ? 'transparent' : 'var(--border-color)'),
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: disabled ? 0.45 : 1,
    transition: 'background var(--transition-base), border-color var(--transition-base)',
  };
  const knob = {
    position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
    background: checked ? '#fff' : 'var(--text-muted)',
    transition: 'left var(--transition-base), background var(--transition-base)',
  };
  const el = (
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange && onChange(!checked)}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChange && onChange(!checked); } }}
      style={{ ...track, ...style }}
      {...rest}
    >
      <span style={knob} />
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
