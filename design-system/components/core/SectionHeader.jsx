import React from 'react';

export function SectionHeader({ num, eyebrow, title, children, align = 'left', style, ...rest }) {
  const centered = align === 'center';
  return (
    <div style={{ marginBottom: centered ? 48 : 30, textAlign: centered ? 'center' : 'left', ...style }} {...rest}>
      {num ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--primary)', letterSpacing: '0.12em' }}>{num}</div>
      ) : null}
      {eyebrow ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 18 }}>{eyebrow}</div>
      ) : null}
      <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.1rem)', margin: num ? '8px 0 12px' : '0 0 16px' }}>{title}</h2>
      {children ? (
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: 640, lineHeight: 1.7, margin: centered ? '0 auto' : 0 }}>{children}</p>
      ) : null}
    </div>
  );
}
