import React from 'react';

export function Toast({ open = false, icon, code, children, style, ...rest }) {
  return (
    <div
      style={{
        position: 'fixed', left: '50%', bottom: 28,
        transform: 'translateX(-50%) translateY(' + (open ? '0' : '18px') + ')',
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px',
        background: 'var(--bg-elevated)', border: '1px solid var(--primary)',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'var(--shadow-lg), var(--shadow-glow)',
        color: 'var(--text-primary)', fontSize: '0.85rem',
        opacity: open ? 1 : 0, pointerEvents: 'none',
        transition: 'opacity var(--transition-base), transform var(--transition-base)',
        zIndex: 200, ...style,
      }}
      {...rest}
    >
      <span style={{ color: 'var(--primary)', display: 'inline-flex' }}>
        {icon || <i className="fa-solid fa-check" />}
      </span>
      {children}
      {code ? <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--primary)' }}>{code}</code> : null}
    </div>
  );
}
