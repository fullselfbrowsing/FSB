import React from 'react';
import { FsbMark } from '../brand/FsbMark.jsx';
import { Button } from '../core/Button.jsx';

export function NavBar({ links = [], active, onNavigate, action, fixed = true, style, ...rest }) {
  return (
    <nav
      style={{
        position: fixed ? 'fixed' : 'relative',
        top: 0, left: 0, right: 0, height: 'var(--nav-height)',
        background: 'var(--bg-nav)',
        backdropFilter: 'blur(var(--blur-nav))', WebkitBackdropFilter: 'blur(var(--blur-nav))',
        zIndex: 1000, transition: 'background var(--transition-base)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--gutter)' }}>
        <a
          href={links[0] ? links[0].href : '#'}
          onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(links[0]); } }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)' }}
        >
          <FsbMark size="1.5rem" />
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {links.map((l) => {
            const on = l.label === active;
            return (
              <a
                key={l.label}
                href={l.href}
                onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(l); } }}
                style={{ position: 'relative', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500, transition: 'color var(--transition-fast)' }}
              >
                {l.label}
                {on ? <span style={{ position: 'absolute', bottom: -4, left: 0, right: 0, height: 2, background: 'var(--primary)', borderRadius: 1 }} /> : null}
              </a>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {action !== undefined ? action : (
            <Button variant="github" size="sm" href="#" icon={<i className="fa-brands fa-github" />}>GitHub</Button>
          )}
        </div>
      </div>
    </nav>
  );
}
