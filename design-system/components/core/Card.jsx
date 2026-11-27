import React from 'react';

export function Card({ variant = 'feature', icon, title, badge, recommended, footer, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);

  const shells = {
    feature: {
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: '28px 26px',
      transition: 'transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base)',
      ...(hover ? { borderColor: 'var(--border-hover)', transform: 'translateY(-4px)', boxShadow: 'var(--shadow-md)' } : null),
    },
    provider: {
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: '26px 22px', textAlign: 'center', position: 'relative',
      transition: 'transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base)',
      ...(recommended ? { borderColor: 'var(--primary)', boxShadow: 'var(--shadow-glow)' } : null),
      ...(hover ? { borderColor: recommended ? 'var(--primary)' : 'var(--border-hover)', transform: 'translateY(-3px)', boxShadow: recommended ? 'var(--shadow-glow)' : 'var(--shadow-sm)' } : null),
    },
    competitor: {
      background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: '24px 16px', textAlign: 'center',
      opacity: hover ? 1 : 0.72,
      transition: 'opacity var(--transition-base), border-color var(--transition-base)',
      ...(hover ? { borderColor: 'var(--border-hover)' } : null),
    },
    highlight: {
      background: 'var(--bg-elevated)', border: '2px solid var(--primary)',
      borderRadius: 'var(--radius-lg)', padding: '30px 32px', textAlign: 'center',
      boxShadow: 'var(--shadow-glow), 0 0 40px rgba(255, 107, 53, 0.08)',
    },
  };

  const iconTile = {
    feature: { width: 34, height: 34, fontSize: '0.95rem', borderRadius: 'var(--radius-sm)', background: 'var(--primary-soft)', color: 'var(--primary)' },
    provider: { width: 46, height: 46, fontSize: '1.35rem', margin: '0 auto 14px', color: 'var(--text-secondary)' },
    competitor: { width: 40, height: 40, fontSize: '1.2rem', margin: '0 auto 12px', color: 'var(--text-secondary)' },
  }[variant];

  const titleSize = { feature: '1.1rem', provider: '1.02rem', competitor: '0.92rem', highlight: '1.1rem' }[variant];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...shells[variant], ...style }}
      {...rest}
    >
      {recommended && variant === 'provider' ? (
        <span style={{ display: 'inline-block', marginBottom: 12, fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: 'var(--primary)', padding: '3px 9px', borderRadius: 'var(--radius-tag)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recommended
        </span>
      ) : null}

      {variant === 'feature' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, alignItems: 'center' }}>
          {icon ? <span style={{ ...iconTile, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span> : null}
          <h3 style={{ fontSize: titleSize, margin: 0 }}>{title}</h3>
          {children ? <p style={{ fontSize: '0.88rem', lineHeight: 1.6, gridColumn: '1 / -1', marginTop: 12 }}>{children}</p> : null}
        </div>
      ) : (
        <React.Fragment>
          {icon ? <span style={{ ...iconTile, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span> : null}
          {title ? (
            variant === 'competitor'
              ? <h4 style={{ fontSize: titleSize, fontWeight: 600, marginBottom: 8 }} translate="no">{title}</h4>
              : <h3 style={{ fontSize: titleSize, marginBottom: 6 }} translate="no">{title}</h3>
          ) : null}
          {children ? <p style={{ fontSize: variant === 'provider' ? '0.8rem' : '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{children}</p> : null}
          {badge}
          {footer}
        </React.Fragment>
      )}
    </div>
  );
}
