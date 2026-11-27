import React from 'react';

const BASE = {
  alignItems: 'center',
  borderRadius: 'var(--radius-md)',
  display: 'inline-flex',
  fontSize: '1rem',
  fontWeight: 600,
  gap: '8px',
  justifyContent: 'center',
  padding: '12px 28px',
  transition: 'all var(--transition-base)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: 'none',
  fontFamily: 'inherit',
  textDecoration: 'none',
};

const VARIANTS = {
  primary: {
    rest: { background: 'var(--primary-gradient)', boxShadow: '0 4px 14px var(--primary-glow)', color: '#fff' },
    hover: { boxShadow: '0 6px 20px rgba(255, 107, 53, 0.45)', transform: 'translateY(-2px)' },
  },
  outline: {
    rest: { background: 'transparent', border: '2px solid var(--primary)', color: 'var(--primary)', padding: '10px 26px' },
    hover: { background: 'rgba(255, 107, 53, 0.1)', transform: 'translateY(-2px)' },
  },
  github: {
    rest: { background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' },
    hover: { background: 'var(--text-muted)', transform: 'translateY(-2px)' },
  },
};

export function Button({ variant = 'primary', size = 'md', icon, href, disabled, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const sm = size === 'sm' ? { fontSize: '0.875rem', padding: variant === 'outline' ? '6px 16px' : '8px 18px' } : null;
  const css = {
    ...BASE,
    ...v.rest,
    ...sm,
    ...(hover && !disabled ? v.hover : null),
    ...(disabled ? { opacity: 0.45, cursor: 'not-allowed', transform: 'none' } : null),
    ...style,
  };
  const Tag = href ? 'a' : 'button';
  return (
    <Tag
      href={href}
      disabled={Tag === 'button' ? disabled : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={css}
      {...rest}
    >
      {icon}
      {children}
    </Tag>
  );
}
