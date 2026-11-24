import React from 'react';

const VARIANTS = {
  eyebrow: {
    display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '6px 14px',
    background: 'var(--primary-wash)', border: '1px solid var(--primary-wash-border)',
    borderRadius: 'var(--radius-pill)', color: 'var(--primary)', fontSize: '0.72rem',
    fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  },
  fsb: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem',
    fontWeight: 700, color: '#fff', background: 'var(--primary)', padding: '5px 12px',
    borderRadius: 'var(--radius-tag)',
  },
  competitor: {
    display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem',
    fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-wash)',
    padding: '4px 11px', borderRadius: 'var(--radius-tag)',
  },
  recommended: {
    display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, color: '#fff',
    background: 'var(--primary)', padding: '3px 9px', borderRadius: 'var(--radius-tag)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  nav: {
    display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 12px',
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-pill)', fontSize: '0.76rem', color: 'var(--text-secondary)',
  },
  selector: {
    fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '5px 10px',
    background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-color)',
    borderRadius: '4px', color: 'var(--text-secondary)',
  },
  tool: {
    fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--primary)',
    background: 'rgba(255, 107, 53, 0.08)', border: '1px solid rgba(255, 107, 53, 0.2)',
    borderRadius: '8px', padding: '5px 11px',
  },
};

export function Badge({ variant = 'eyebrow', icon, meta, children, style, ...rest }) {
  const mono = variant === 'selector' || variant === 'tool';
  return (
    <span translate={mono ? 'no' : undefined} style={{ ...(VARIANTS[variant] || VARIANTS.eyebrow), ...style }} {...rest}>
      {icon}
      {children}
      {meta ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)' }}>{meta}</span>
      ) : null}
    </span>
  );
}
