import React from 'react';
import { FsbMark } from '../brand/FsbMark.jsx';

export function Footer({ columns = [], byline, version, bottomLinks = [], style, ...rest }) {
  return (
    <footer
      style={{
        background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)',
        padding: '48px 0 32px', marginBottom: 24, ...style,
      }}
      {...rest}
    >
      <div style={{ margin: '0 auto', maxWidth: 'var(--max-width)', padding: '0 var(--gutter)', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginBottom: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
            <FsbMark size="1.32rem" version={version} />
            {byline ? <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{byline}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
            {columns.map((c) => (
              <div key={c.title}>
                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', marginBottom: 12 }}>{c.title}</h4>
                {c.links.map((l) => (
                  <a key={l.label} href={l.href} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '4px 0' }}>{l.label}</a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{byline}</p>
          <div style={{ display: 'flex', gap: 20 }}>
            {bottomLinks.map((l) => (
              <a key={l.label} href={l.href} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{l.label}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
