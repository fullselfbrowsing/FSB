import { Component, OnInit, Renderer2, inject, DOCUMENT, LOCALE_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';

const ROUTE_PATH = '/support';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@support.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;

// Plain-text mirror of the Support FAQ for Schema.org FAQPage JSON-LD.
// Keep in sync with support-page.component.html.
const SUPPORT_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: $localize`:@@support.schema.faq.install.q:How do I install FSB?`,
    a: $localize`:@@support.schema.faq.install.a:Install from the Chrome Web Store. One click and the FSB icon appears in your toolbar. Prefer to run from source? Download the latest release from GitHub, then load it unpacked: open chrome://extensions, enable Developer Mode, click "Load unpacked," and select the FSB folder.`,
  },
  {
    q: $localize`:@@support.schema.faq.provider.q:Which AI provider should I use?`,
    a: $localize`:@@support.schema.faq.provider.a:We recommend xAI Grok 4.1 Fast for the best balance of speed and accuracy. It has a 2M token context window and costs $0.20/$0.50 per million tokens. For a free hosted option, try Gemini 2.0 Flash (experimental). For maximum quality, use Claude Opus 4.6 or Grok 4.1. If you want broad model access, use OpenRouter. If you want a privacy-friendly local setup with no API key, use LM Studio.`,
  },
  {
    q: $localize`:@@support.schema.faq.browsers.q:Which browsers are supported?`,
    a: $localize`:@@support.schema.faq.browsers.a:FSB supports Chrome 88+ and all Chromium-based browsers including Microsoft Edge, Brave, Opera, and Vivaldi. Firefox support is planned for a future release.`,
  },
  {
    q: $localize`:@@support.schema.faq.apiKeys.q:Are my API keys secure?`,
    a: $localize`:@@support.schema.faq.apiKeys.a:Yes. API keys are encrypted using AES-GCM before being stored in Chrome's local storage. They are only decrypted in-memory when making API calls. Keys are never logged, exported, or transmitted to any server other than your chosen AI provider.`,
  },
  {
    q: $localize`:@@support.schema.faq.safety.q:Is FSB safe to use?`,
    a: $localize`:@@support.schema.faq.safety.a:FSB includes action validation and safety checks. It only performs actions on the current tab and only when explicitly instructed. All code is open source and auditable. That said, use caution with tasks involving sensitive accounts or financial transactions -- always review what FSB is doing.`,
  },
  {
    q: $localize`:@@support.schema.faq.reportBug.q:How do I report a bug?`,
    a: $localize`:@@support.schema.faq.reportBug.a:Open an issue on the GitHub Issues page at https://github.com/fullselfbrowsing/FSB/issues. Include the website URL, your task description, and any error messages from the FSB chat or browser console. Session logs from the Debug tab in Options can also help.`,
  },
  {
    q: $localize`:@@support.schema.faq.mcp.q:What is MCP and how do I use it?`,
    a: $localize`:@@support.schema.faq.mcp.a:MCP (Model Context Protocol) lets you control FSB from AI coding tools like Claude Code, Codex, Cursor, Windsurf, and OpenClaw. The MCP server runs as npx -y fsb-mcp-server and pairs with the running extension over a local WebSocket bridge. FSB exposes 66 MCP tools (click, type, navigate, read DOM, fill vault credentials, and more). For OpenClaw users specifically, the fastest path is the one-click install on ClawHub at https://clawhub.ai/lakshmanturlapati/full-selfbrowsing, or load the FSB skill at skills/fsb/ which prints the stdio config block and runs the doctor diagnostic. The full rundown lives at https://full-selfbrowsing.com/agents.`,
  },
  {
    q: $localize`:@@support.schema.faq.testApps.q:How does FSB help Claude Code or Codex test apps?`,
    a: $localize`:@@support.schema.faq.testApps.a:Connect FSB as an MCP server, then let the coding agent open the local app, click through real flows, observe DOM state, capture console or task errors, and report failures back into the coding session. This closes the manual loop between code generation, browser testing, logging, and fixing.`,
  },
  {
    q: $localize`:@@support.schema.faq.remote.q:Can I control FSB remotely?`,
    a: $localize`:@@support.schema.faq.remote.a:Yes. The Remote Dashboard at full-selfbrowsing.com lets you pair with your FSB extension via QR code, then send tasks, view a live DOM preview of the browser, and monitor current execution state from any device with a web browser.`,
  },
  {
    q: $localize`:@@support.schema.faq.learn.q:Does FSB learn from my usage?`,
    a: $localize`:@@support.schema.faq.learn.a:FSB has a local memory system with three layers: semantic memory (site navigation patterns), episodic memory (past action sequences), and procedural memory (successful workflows). This data stays on your device and helps FSB navigate familiar sites faster and avoid repeating mistakes. Memory auto-consolidates after enough sessions.`,
  },
  {
    q: $localize`:@@support.schema.faq.ideSetup.q:How do I set up FSB's MCP server with my IDE?`,
    a: $localize`:@@support.schema.faq.ideSetup.a:Run npx -y fsb-mcp-server install --list to see which MCP hosts the installer detects on your machine, then run the installer for one (for example npx -y fsb-mcp-server install --claude-desktop). Cursor, Codex, Windsurf, and others have matching flags from --list. For OpenClaw, paste the canonical stdio block printed by the FSB skill (loaded from skills/fsb/) into your OpenClaw MCP config -- the bare --openclaw installer flag is intentionally manual because OpenClaw's MCP config schema is still unstable across builds. Verify the install with npx -y fsb-mcp-server doctor; six green layers means you're ready.`,
  },
  {
    q: $localize`:@@support.schema.faq.tools.q:What can I do with FSB through MCP tools?`,
    a: $localize`:@@support.schema.faq.tools.a:FSB exposes two modes through MCP. Manual mode is the default and gives the calling agent 66 granular tools: navigate, click, type, scroll, read page state, take screenshots, fill spreadsheets, fill vault credentials, and more. Autopilot mode (run_task) only fires when the user explicitly delegates the whole task. Phrases like "use FSB autopilot", "delegate this", or naming run_task directly. For everything else the calling agent stays in the loop on every action, which is exactly what coding agents want when they're testing an app in-browser and feeding observations back into the editor.`,
  },
  {
    q: $localize`:@@support.schema.faq.openclawInstall.q:How do I install FSB on OpenClaw?`,
    a: $localize`:@@support.schema.faq.openclawInstall.a:Three options, fastest first. One-click on ClawHub: install from https://clawhub.ai/lakshmanturlapati/full-selfbrowsing. FSB skill: load the skill from skills/fsb/ in the FSB repo. It prints the canonical OpenClaw stdio block for you to paste into OpenClaw's MCP config and offers consent-gated install for any other MCP hosts on your machine. The full 3-step walkthrough (Chrome extension, MCP server config, doctor verification) lives at https://full-selfbrowsing.com/agents.`,
  },
  {
    q: $localize`:@@support.schema.faq.mcpHealth.q:How do I verify the FSB MCP server is healthy?`,
    a: $localize`:@@support.schema.faq.mcpHealth.a:Run npx -y fsb-mcp-server doctor. The doctor walks six layers -- package, bridge, extension, active-tab, content-script, config -- and exits non-zero on the first failure with a one-line next-step recommendation. The full recovery table for each layer lives in skills/fsb/USAGE.md, and the same diagnostic runs automatically when the FSB skill is loaded into OpenClaw.`,
  },
];

@Component({
  selector: 'app-support-page',
  standalone: true,
  templateUrl: './support-page.component.html',
  styleUrl: './support-page.component.scss',
})
export class SupportPageComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Marked via $localize so per-locale builds emit translated strings; embedded brand
    // tokens (FSB, MCP, GitHub, Chrome) are preserved verbatim by translators per
    // DO-NOT-TRANSLATE.md.
    const t = $localize`:@@support.meta.title:FSB - Support`;
    const d = $localize`:@@support.meta.description:Get help with FSB: setup guides, MCP configuration, troubleshooting, GitHub issues, and direct contact for the open-source Chrome extension.`;
    this.applyMeta(t, d, url);
    this.injectSupportFaqJsonLd();
  }

  private applyMeta(t: string, d: string, url: string): void {
    this.title.setTitle(t);
    this.meta.updateTag({ name: 'description', content: d });
    this.meta.updateTag({ property: 'og:title', content: t });
    this.meta.updateTag({ property: 'og:description', content: d });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:image', content: OG_IMAGE });
    this.meta.updateTag({ property: 'og:image:width', content: '1000' });
    this.meta.updateTag({ property: 'og:image:height', content: '1000' });
    this.meta.updateTag({ property: 'og:image:alt', content: OG_IMAGE_ALT });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: t });
    this.meta.updateTag({ name: 'twitter:description', content: d });
    this.meta.updateTag({ name: 'twitter:image', content: OG_IMAGE });
    this.meta.updateTag({ name: 'twitter:image:alt', content: OG_IMAGE_ALT });
    emitLocaleHead(this.renderer, this.doc, this.localeId, ROUTE_PATH);
  }

  private injectSupportFaqJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="support-faq"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${HOST}/support#faq`,
      url: `${HOST}/support`,
      isPartOf: { '@id': `${HOST}/#site` },
      mainEntity: SUPPORT_FAQ.map((qa) => ({
        '@type': 'Question',
        name: qa.q,
        acceptedAnswer: { '@type': 'Answer', text: qa.a },
      })),
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'support-faq');
    const text = this.renderer.createText(json);
    this.renderer.appendChild(script, text);
    this.renderer.appendChild(this.doc.head, script);
  }

  toggleFaq(event: Event): void {
    const question = event.currentTarget as HTMLElement;
    const item = question.closest('.faq-item');
    if (item) {
      item.classList.toggle('active');
    }
  }
}
