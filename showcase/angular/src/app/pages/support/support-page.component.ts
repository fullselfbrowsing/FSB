import { Component, OnDestroy, OnInit, Renderer2, inject, DOCUMENT, LOCALE_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { PageJsonLdService } from '../../core/seo/page-json-ld.service';

const ROUTE_PATH = '/support';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@support.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;

// FAQ answers used by both the visible page and its structured data.
const SUPPORT_FAQ = {
  install: {
    q: $localize`:@@support.schema.faq.install.q:How do I install FSB?`,
    a: $localize`:@@support.schema.faq.install.a:Install from the Chrome Web Store. One click and the FSB icon appears in your toolbar. Prefer to run from source? Download the latest release from GitHub, then load it unpacked: open chrome://extensions, enable Developer Mode, click "Load unpacked," and select the FSB folder.`,
  },
  provider: {
    q: $localize`:@@support.schema.faq.provider.q:Which AI provider should I use?`,
    a: $localize`:@@support.schema.faq.provider.a:Choose a supported provider and model in Options based on your task, budget, and privacy needs. Use your own API key for hosted models, OpenRouter for access to multiple providers, or LM Studio for local models. Check your provider's current availability and pricing before choosing a model.`,
  },
  browsers: {
    q: $localize`:@@support.schema.faq.browsers.q:Which browsers are supported?`,
    a: $localize`:@@support.schema.faq.browsers.a:FSB requires Chrome 116 or later, or a compatible desktop Chromium browser such as Microsoft Edge, Brave, Opera, or Vivaldi. Firefox is not currently supported.`,
  },
  apiKeys: {
    q: $localize`:@@support.schema.faq.apiKeys.q:Are my API keys secure?`,
    a: $localize`:@@support.schema.faq.apiKeys.a:API keys are encrypted with AES-GCM in Chrome's local storage. Requests to hosted AI models send task data to your selected provider. Vault tools can fill credentials and payment details in the browser without sending raw secrets across the MCP bridge.`,
  },
  safety: {
    q: $localize`:@@support.schema.faq.safety.q:Is FSB safe to use?`,
    a: $localize`:@@support.schema.faq.safety.a:FSB includes action validation and safety checks. It can work across multiple tabs; MCP agents use agent identity and tab ownership to scope actions. Autopilot runs when you explicitly delegate a task. Review automation involving sensitive accounts or payments. The source code is open and auditable.`,
  },
  reportBug: {
    q: $localize`:@@support.schema.faq.reportBug.q:How do I report a bug?`,
    a: $localize`:@@support.schema.faq.reportBug.a:Open an issue on the GitHub Issues page at https://github.com/fullselfbrowsing/FSB/issues. Include the website URL, your task description, and any error messages from the FSB chat or browser console. Session logs from the Debug tab in Options can also help.`,
  },
  mcp: {
    q: $localize`:@@support.schema.faq.mcp.q:What is MCP and how do I use it?`,
    a: $localize`:@@support.schema.faq.mcp.a:MCP (Model Context Protocol) lets you control FSB from AI coding tools like Claude Code, Codex, Cursor, Windsurf, and OpenClaw. The MCP server runs as npx -y fsb-mcp-server@latest and pairs with the running extension over a local WebSocket bridge. FSB exposes 68 MCP tools (click, type, navigate, read DOM, fill vault credentials, and more). For OpenClaw users specifically, the fastest path is the one-click install on ClawHub at https://clawhub.ai/lakshmanturlapati/full-selfbrowsing, or load the FSB skill at skills/fsb/ which prints the stdio config block and runs the doctor diagnostic. The full rundown lives at https://full-selfbrowsing.com/agents.`,
  },
  testApps: {
    q: $localize`:@@support.schema.faq.testApps.q:How does FSB help Claude Code or Codex test apps?`,
    a: $localize`:@@support.schema.faq.testApps.a:Connect FSB as an MCP server, then let the coding agent open the local app, click through real flows, observe DOM state, capture console or task errors, and report failures back into the coding session. This closes the manual loop between code generation, browser testing, logging, and fixing.`,
  },
  remote: {
    q: $localize`:@@support.schema.faq.remote.q:Can I control FSB remotely?`,
    a: $localize`:@@support.schema.faq.remote.a:Yes. The Remote Dashboard at full-selfbrowsing.com lets you pair with your FSB extension via QR code, then send tasks, view a live DOM preview of the browser, and monitor current execution state from any device with a web browser.`,
  },
  learn: {
    q: $localize`:@@support.schema.faq.learn.q:Does FSB learn from my usage?`,
    a: $localize`:@@support.schema.faq.learn.a:FSB has a local memory system with three layers: semantic memory (site navigation patterns), episodic memory (past action sequences), and procedural memory (successful workflows). This data stays on your device and helps FSB navigate familiar sites faster and avoid repeating mistakes. Memory auto-consolidates after enough sessions.`,
  },
  ideSetup: {
    q: $localize`:@@support.schema.faq.ideSetup.q:How do I set up FSB's MCP server with my IDE?`,
    a: $localize`:@@support.schema.faq.ideSetup.a:Run npx -y fsb-mcp-server@latest install --list to see which MCP hosts the installer detects on your machine, then run the installer for one (for example npx -y fsb-mcp-server@latest install --claude-desktop). Cursor, Codex, Windsurf, and others have matching flags from --list. For OpenClaw, paste the canonical stdio block printed by the FSB skill (loaded from skills/fsb/) into your OpenClaw MCP config -- the bare --openclaw installer flag is intentionally manual because OpenClaw's MCP config schema is still unstable across builds. Verify the install with npx -y fsb-mcp-server@latest doctor; six green layers means you're ready.`,
  },
  tools: {
    q: $localize`:@@support.schema.faq.tools.q:What can I do with FSB through MCP tools?`,
    a: $localize`:@@support.schema.faq.tools.a:FSB exposes two modes through MCP. Manual mode is the default and gives the calling agent 68 granular tools: navigate, click, type, scroll, read page state, take screenshots, upload real local files with upload_file, arm trigger watchers with trigger / get_trigger_status / list_triggers, and search or invoke guarded first-party API capabilities with search_capabilities and invoke_capability. Vault and payment helpers fill inside the encrypted extension store, so raw secrets do not cross the MCP bridge. Autopilot mode (run_task) only fires when the user explicitly delegates the whole task. For everything else the calling agent stays in the loop on every action.`,
  },
  openclawInstall: {
    q: $localize`:@@support.schema.faq.openclawInstall.q:How do I install FSB on OpenClaw?`,
    a: $localize`:@@support.schema.faq.openclawInstall.a:Three options, fastest first. One-click on ClawHub: install from https://clawhub.ai/lakshmanturlapati/full-selfbrowsing. FSB skill: load the skill from skills/fsb/ in the FSB repo. It prints the canonical OpenClaw stdio block for you to paste into OpenClaw's MCP config and offers consent-gated install for any other MCP hosts on your machine. The full 3-step walkthrough (Chrome extension, MCP server config, doctor verification) lives at https://full-selfbrowsing.com/agents.`,
  },
  mcpHealth: {
    q: $localize`:@@support.schema.faq.mcpHealth.q:How do I verify the FSB MCP server is healthy?`,
    a: $localize`:@@support.schema.faq.mcpHealth.a:Run npx -y fsb-mcp-server@latest doctor. The doctor walks six layers -- package, bridge, extension, active-tab, content-script, config -- and exits non-zero on the first failure with a one-line next-step recommendation. The full recovery table for each layer lives in skills/fsb/USAGE.md, and the same diagnostic runs automatically when the FSB skill is loaded into OpenClaw.`,
  },
  costs: {
    q: $localize`:@@support.schema.faq.costs.q:Is FSB free, and what does AI usage cost?`,
    a: $localize`:@@support.schema.faq.costs.a:FSB is free and open source under the MIT license. When you use your own API key, your chosen provider sets and bills model usage. Agent CLI mode uses your existing agent setup; MCP mode uses the calling agent's model. Local models through LM Studio do not require a hosted-provider API key.`,
  },
} as const;

@Component({
  selector: 'app-support-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './support-page.component.html',
  styleUrl: './support-page.component.scss',
})
export class SupportPageComponent implements OnInit, OnDestroy {
  private readonly pageJsonLd = inject(PageJsonLdService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);

  readonly faqs = Object.entries(SUPPORT_FAQ).map(([id, answer]) => ({ id, ...answer }));
  readonly resourceNames = { store: 'Chrome Web Store', github: 'GitHub', issues: 'GitHub Issues', clawhub: 'ClawHub' };
  readonly expandedFaqs = new Set<string>();

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Marked via $localize so per-locale builds emit translated strings; embedded brand
    // tokens (FSB, MCP, GitHub, Chrome) are preserved verbatim by translators per
    // DO-NOT-TRANSLATE.md.
    const t = $localize`:@@support.meta.title:FSB Support | Installation & MCP Setup`;
    const d = $localize`:@@support.meta.description:Find FSB installation steps, Chrome requirements, model costs, privacy answers, MCP setup, and troubleshooting for browser automation.`;
    this.applyMeta(t, d, url);
    this.injectSupportFaqJsonLd();
  }

  ngOnDestroy(): void {
    this.pageJsonLd.remove('support-faq');
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
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${buildLocaleUrl(this.localeId, ROUTE_PATH)}#faq`,
      url: buildLocaleUrl(this.localeId, ROUTE_PATH),
      inLanguage: this.localeId,
      name: this.title.getTitle(),
      description: this.meta.getTag('name="description"')?.content,
      publisher: { '@id': `${HOST}/#org` },
      mainEntity: Object.values(SUPPORT_FAQ).map((qa) => ({
        '@type': 'Question',
        name: qa.q,
        acceptedAnswer: { '@type': 'Answer', text: qa.a },
      })),
    };
    this.pageJsonLd.set('support-faq', payload);
  }

  toggleFaq(id: string): void {
    if (this.expandedFaqs.has(id)) this.expandedFaqs.delete(id);
    else this.expandedFaqs.add(id);
  }
}
