import React from 'react';

export function StatBlock({ stats = [], gap = 40, style, ...rest }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap, flexWrap: 'wrap', ...style }} {...rest}>
      {stats.map((s, i) => (
        <div key={i}>
          <div translate="no" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{s.value}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
