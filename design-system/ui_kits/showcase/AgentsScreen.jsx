/* FSB showcase site — agents directory. Search + filter over site guides. */
function AgentsScreen({ NS }) {
  const { SectionHeader, SearchField, Badge, Card, Toggle } = NS;
  const [q, setQ] = React.useState('');
  const [apiOnly, setApiOnly] = React.useState(false);

  const guides = [
    { name: 'Linear', path: '/issues', api: true, tools: ['create_issue', 'assign'] },
    { name: 'GitHub', path: '/pulls', api: true, tools: ['review_pr', 'merge'] },
    { name: 'Gmail', path: '/mail/u/0', api: true, tools: ['compose', 'archive'] },
    { name: 'Notion', path: '/workspace', api: false, tools: ['append_block'] },
    { name: 'Amazon', path: '/cart', api: false, tools: ['add_to_cart', 'checkout'] },
    { name: 'Google Flights', path: '/travel/flights', api: false, tools: ['search_flights'] },
  ];

  const shown = guides.filter((g) =>
    (!apiOnly || g.api) && g.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <main style={{ paddingTop: 'var(--nav-height)' }}>
      <section style={{ padding: '64px var(--gutter) var(--section-padding)' }}>
        <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto' }}>
          <SectionHeader eyebrow="Site guides" title="130+ sites, mapped">
            Each guide teaches FSB an app's structure — the routes that matter, the selectors that survive, and the API calls that skip the DOM entirely.
          </SectionHeader>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
            <SearchField placeholder="Search 130+ site guides" value={q} onChange={(e) => setQ(e.target.value)} />
            <Toggle checked={apiOnly} onChange={setApiOnly} label="Native API only" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--text-muted)' }}>{shown.length} of {guides.length}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {shown.map((g) => (
              <Card
                key={g.name}
                icon={<i className={g.api ? 'fa-solid fa-bolt' : 'fa-solid fa-hand-pointer'} />}
                title={g.name}
                footer={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, justifyContent: 'center' }}>
                    {g.tools.map((t) => <Badge key={t} variant="tool">{t}</Badge>)}
                  </div>
                }
              >
                <Badge variant="nav" meta={g.path}>{g.name}</Badge>
              </Card>
            ))}
          </div>

          {shown.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>No guide matches that filter.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
window.AgentsScreen = AgentsScreen;
