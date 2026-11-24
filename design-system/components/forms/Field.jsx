import React from 'react';

/* Label + control wrapper. Every form control in the system sits in one of these. */
export function Field({ label, hint, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} {...rest}>
      {label ? (
        <label htmlFor={htmlFor} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      ) : null}
      {children}
      {hint ? <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </div>
  );
}
