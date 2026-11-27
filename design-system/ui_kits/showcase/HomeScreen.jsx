/* FSB showcase site — home. Composes the design-system primitives; no new styling. */
function HomeScreen({ NS, onNavigate }) {
  const { FsbMark, Button, Badge, Card, SectionHeader, StatBlock } = NS;

  return (
    <main style={{ paddingTop: 'var(--nav-height)' }}>
      <section style={{ position: 'relative', overflow: 'hidden', padding: '96px var(--gutter) 72px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 56% 60% at 28% 0%, rgba(255,107,53,.16), transparent 70%)', pointerEvents: 'none', animation: 'heroGlow 14s ease-in-out infinite' }} />
        <div style={{ position: 'relative', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
          <Badge icon={<i className="fa-solid fa-bolt" />} style={{ marginBottom: 22 }}>Native API handlers</Badge>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', letterSpacing: 'var(--tracking-tight)', marginBottom: 18, maxWidth: 780 }}>
            Better than all of them. <span style={{ background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Without vision.</span>
          </h1>
          <p style={{ fontSize: '1.12rem', maxWidth: 600, marginBottom: 30 }}>
            FSB reads the actual DOM and calls an app's own authenticated API through your session. Tell it what to do, and watch it browse for you.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button icon={<i className="fa-brands fa-chrome" />}>Get Started</Button>
            <Button variant="outline" icon={<i className="fa-solid fa-play" />}>See it in Action</Button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 32 }}>
            {[['fa-solid fa-gauge-high', '50-200ms per step'], ['fa-solid fa-database', '~$0.03 per 100 steps'], ['fa-solid fa-compass', '130+ site guides']].map(([ic, t]) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-pill)', fontSize: '.78rem', color: 'var(--text-secondary)' }}>
                <i className={ic} style={{ color: 'var(--primary)', fontSize: '.76rem' }} /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: 'var(--section-padding)' }}>
        <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--gutter)' }}>
          <SectionHeader align="center" eyebrow="How it works" title="Built for the Modern Web">
            Four mechanisms do the work. None of them need a screenshot.
          </SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Card icon={<i className="fa-solid fa-bolt" />} title="Direct API Execution">
              Calls an app's own authenticated API through your session, with DOM automation as the automatic fallback.
            </Card>
            <Card icon={<i className="fa-solid fa-sitemap" />} title="Smart DOM Analysis">
              Incremental DOM diffing, multi-strategy selectors and element identification for reliable automation.
            </Card>
            <Card icon={<i className="fa-solid fa-plug" />} title="Model Agnostic">
              Bring your own provider. Grok, Claude, Gemini, or a local model through LM Studio.
            </Card>
            <Card icon={<i className="fa-solid fa-tower-broadcast" />} title="Live Session Streaming">
              Every step streams to the dashboard as it happens, with a full transcript when it finishes.
            </Card>
          </div>
        </div>
      </section>

      <section style={{ padding: 'var(--section-padding)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--gutter)' }}>
          <SectionHeader align="center" eyebrow="Providers" title="Bring your own model" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Card variant="provider" recommended icon={<i className="fa-solid fa-bolt" />} title="xAI Grok">Grok 4.1 Fast, Grok 4</Card>
            <Card variant="provider" icon={<i className="fa-solid fa-robot" />} title="Anthropic">Claude Opus, Sonnet, Haiku</Card>
            <Card variant="provider" icon={<i className="fa-solid fa-cube" />} title="LM Studio">Local models · no API key</Card>
          </div>
        </div>
      </section>

      <section style={{ padding: 'var(--section-padding)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--gutter)' }}>
          <SectionHeader align="center" eyebrow="Comparison" title="Faster. Cheaper. More accurate." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card variant="competitor" icon={<i className="fa-solid fa-eye" />} title="Project Mariner" badge={<Badge variant="competitor" icon={<i className="fa-solid fa-eye" />}>Vision</Badge>} />
              <Card variant="competitor" icon={<i className="fa-solid fa-eye" />} title="Operator" badge={<Badge variant="competitor" icon={<i className="fa-solid fa-eye" />}>Vision</Badge>} />
            </div>
            <Card variant="highlight">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10, color: 'var(--text-primary)' }}>
                <FsbMark size="1.4rem" />
                <Badge variant="fsb" icon={<i className="fa-solid fa-code" />}>DOM-Based</Badge>
              </div>
              <StatBlock stats={[{ value: '50-200ms', label: 'per step' }, { value: '~$0.03', label: 'per 100 steps' }]} />
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
window.HomeScreen = HomeScreen;
