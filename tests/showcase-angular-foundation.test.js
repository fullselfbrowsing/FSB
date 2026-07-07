/**
 * Source contracts for showcase Angular routes and theme parity.
 * Run: node tests/showcase-angular-foundation.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
  }
}

function readIfPresent(relativePath) {
  const absolutePath = path.join(__dirname, '..', relativePath);
  const exists = fs.existsSync(absolutePath);

  assert(exists, `${relativePath} exists`);
  if (!exists) {
    return '';
  }

  return fs.readFileSync(absolutePath, 'utf8');
}

console.log('\n--- showcase angular foundation contracts ---');

const rootPackageSource = readIfPresent('package.json');
const dockerfileSource = readIfPresent('Dockerfile');
const angularConfigSource = readIfPresent('showcase/angular/angular.json');
const mainSource = readIfPresent('showcase/angular/src/main.ts');
const appConfigSource = readIfPresent('showcase/angular/src/app/app.config.ts');
const routeSource = readIfPresent('showcase/angular/src/app/app.routes.ts');
const indexSource = readIfPresent('showcase/angular/src/index.html');
const appComponentSource = readIfPresent('showcase/angular/src/app/app.component.ts');
const appComponentTemplateSource = readIfPresent('showcase/angular/src/app/app.component.html');
const shellComponentSource = readIfPresent('showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.ts');
const shellTemplateSource = readIfPresent('showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html');
const shellStyleSource = readIfPresent('showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss');
const globalStylesSource = readIfPresent('showcase/angular/src/styles.scss');
const themeServiceSource = readIfPresent('showcase/angular/src/app/core/theme.service.ts');
const homeComponentSource = readIfPresent('showcase/angular/src/app/pages/home/home-page.component.ts');
const homeStyleSource = readIfPresent('showcase/angular/src/app/pages/home/home-page.component.scss');
const aboutComponentSource = readIfPresent('showcase/angular/src/app/pages/about/about-page.component.ts');
const aboutStyleSource = readIfPresent('showcase/angular/src/app/pages/about/about-page.component.scss');
const dashboardComponentSource = readIfPresent('showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts');
const dashboardStyleSource = readIfPresent('showcase/angular/src/app/pages/dashboard/dashboard-page.component.scss');
const privacyComponentSource = readIfPresent('showcase/angular/src/app/pages/privacy/privacy-page.component.ts');
const privacyStyleSource = readIfPresent('showcase/angular/src/app/pages/privacy/privacy-page.component.scss');
const supportComponentSource = readIfPresent('showcase/angular/src/app/pages/support/support-page.component.ts');
const supportStyleSource = readIfPresent('showcase/angular/src/app/pages/support/support-page.component.scss');

let rootPackage = {};
try {
  rootPackage = JSON.parse(rootPackageSource || '{}');
} catch (error) {
  assert(false, `package.json parses as valid JSON (${error.message})`);
}

let angularConfig = {};
try {
  angularConfig = JSON.parse(angularConfigSource || '{}');
} catch (error) {
  assert(false, `showcase/angular/angular.json parses as valid JSON (${error.message})`);
}

const rootScripts = rootPackage.scripts || {};
const angularOutputPath =
  angularConfig.projects &&
  angularConfig.projects['showcase-angular'] &&
  angularConfig.projects['showcase-angular'].architect &&
  angularConfig.projects['showcase-angular'].architect.build &&
  angularConfig.projects['showcase-angular'].architect.build.options &&
  angularConfig.projects['showcase-angular'].architect.build.options.outputPath;
const buildAssets =
  (angularConfig.projects &&
    angularConfig.projects['showcase-angular'] &&
    angularConfig.projects['showcase-angular'].architect &&
    angularConfig.projects['showcase-angular'].architect.build &&
    angularConfig.projects['showcase-angular'].architect.build.options &&
    angularConfig.projects['showcase-angular'].architect.build.options.assets) ||
  [];
const testAssets =
  (angularConfig.projects &&
    angularConfig.projects['showcase-angular'] &&
    angularConfig.projects['showcase-angular'].architect &&
    angularConfig.projects['showcase-angular'].architect.test &&
    angularConfig.projects['showcase-angular'].architect.test.options &&
    angularConfig.projects['showcase-angular'].architect.test.options.assets) ||
  [];

function hasAssetMapping(assets, mapping) {
  return Array.isArray(assets) && assets.some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    return entry.input === mapping.input && entry.output === mapping.output;
  });
}

assert(
  rootScripts['showcase:install'] === 'npm --prefix showcase/angular install' &&
    rootScripts['showcase:build'] === 'npm --prefix showcase/angular run build' &&
    rootScripts['showcase:serve'] === 'npm --prefix showcase/angular run start',
  'root showcase scripts preserve deterministic npm --prefix workspace delegation'
);

assert(
  /RUN npm run build -- --configuration production/.test(dockerfileSource),
  'Docker showcase build runs npm build so prebuild regenerates crawler files before deploy'
);

// outputPath can be a string or an object { base, browser }
const resolvedOutputPath = typeof angularOutputPath === 'string'
  ? angularOutputPath
  : (angularOutputPath && angularOutputPath.base && angularOutputPath.browser)
    ? angularOutputPath.base + '/' + angularOutputPath.browser
    : '';
assert(
  resolvedOutputPath === '../dist/showcase-angular/browser',
  'angular workspace build output path resolves to ../dist/showcase-angular/browser'
);

assert(
  hasAssetMapping(buildAssets, { input: '../assets', output: 'assets' }),
  'angular build assets map showcase/assets to runtime /assets output'
);

assert(
  hasAssetMapping(testAssets, { input: '../assets', output: 'assets' }),
  'angular test assets map showcase/assets to runtime /assets output'
);

assert(
  fs.existsSync(path.join(__dirname, '..', 'showcase/assets/icon128.png')) &&
    fs.existsSync(path.join(__dirname, '..', 'showcase/assets/icon48.png')),
  'showcase logo assets exist in showcase/assets source directory'
);

assert(
  /bootstrapApplication\(AppComponent,\s*appConfig\)/.test(mainSource),
  'main bootstrap preserves standalone AppComponent + appConfig contract'
);

assert(
  /withInMemoryScrolling/.test(appConfigSource) &&
    /scrollPositionRestoration:\s*'enabled'/.test(appConfigSource) &&
    /provideRouter\(routes,\s*withInMemoryScrolling/.test(appConfigSource),
  'router config restores scroll position to top on route navigation'
);

assert(
  /event instanceof NavigationEnd/.test(shellComponentSource) &&
    /this\.scrollToRouteTop\(\)/.test(shellComponentSource) &&
    /window\.requestAnimationFrame/.test(shellComponentSource) &&
    /window\.scrollTo\(0,\s*0\)/.test(shellComponentSource) &&
    /scroller\.scrollTop = 0/.test(shellComponentSource),
  'showcase shell explicitly resets window scroll after route navigation'
);

assert(
  /path:\s*''/.test(routeSource) &&
    /path:\s*'about'/.test(routeSource) &&
    /path:\s*'dashboard'/.test(routeSource) &&
    /path:\s*'privacy'/.test(routeSource) &&
    /path:\s*'support'/.test(routeSource) &&
    /path:\s*'\*\*'/.test(routeSource),
  'route table preserves canonical paths plus wildcard fallback'
);

assert(
  /typeof window\.matchMedia !== 'function'/.test(indexSource) &&
    /window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/.test(indexSource),
  'index pre-bootstrap script reads system color scheme with a prerender-safe matchMedia guard'
);

assert(
  /if\s*\(\s*!window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches\s*\)\s*\{[\s\S]*setAttribute\('data-theme',\s*'light'\)/.test(indexSource),
  'index pre-bootstrap script applies data-theme=\"light\" for non-dark system theme'
);

const themeBootstrapIndex = indexSource.indexOf("window.matchMedia('(prefers-color-scheme: dark)'");
assert(
  themeBootstrapIndex !== -1 && themeBootstrapIndex < indexSource.indexOf('<app-root>'),
  'theme pre-bootstrap system preference read occurs before app root bootstrap'
);

assert(
  /function getSystemThemeMedia\(\): MediaQueryList \| null/.test(themeServiceSource) &&
    /typeof window\.matchMedia !== 'function'/.test(themeServiceSource) &&
    /window\.matchMedia\('\(prefers-color-scheme: dark\)'\)/.test(themeServiceSource),
  'theme service uses prerender-safe system theme media query'
);

assert(
  /ShowcaseShellComponent/.test(appComponentSource) &&
    /imports:\s*\[[^\]]*RouterOutlet[^\]]*ShellFrameComponent[^\]]*\]/.test(appComponentSource) &&
    /<app-showcase-shell>[\s\S]*<router-outlet[\s\S]*<\/app-showcase-shell>/.test(appComponentTemplateSource),
  'app component preserves showcase shell host + router-outlet frame contract'
);

assert(
  /<div class="nav-links">[\s\S]*routerLink="\/"[\s\S]*routerLink="\/about"[\s\S]*routerLink="\/dashboard"[\s\S]*routerLink="\/privacy"[\s\S]*routerLink="\/support"/.test(shellTemplateSource) &&
    /<div class="nav-mobile"[\s\S]*routerLink="\/"[\s\S]*routerLink="\/about"[\s\S]*routerLink="\/dashboard"[\s\S]*routerLink="\/privacy"[\s\S]*routerLink="\/support"/.test(shellTemplateSource),
  'shell template preserves canonical desktop and mobile routerLink contracts'
);

assert(
  /\[data-theme="light"\]/.test(globalStylesSource) &&
    /\.theme-toggle-btn/.test(shellStyleSource) &&
    /\.nav/.test(shellStyleSource) &&
    /\.footer/.test(shellStyleSource),
  'shared styles keep light-theme selector while shell styles own nav/footer/theme-toggle primitives'
);

assert(
  !/(about-hero|dash-preview|faq-section|privacy-page)/.test(globalStylesSource),
  'global styles avoid page-specific selector leakage'
);

assert(
  /styleUrl:\s*'\.\/home-page\.component\.scss'/.test(homeComponentSource) &&
    /styleUrl:\s*'\.\/about-page\.component\.scss'/.test(aboutComponentSource) &&
    /styleUrl:\s*'\.\/dashboard-page\.component\.scss'/.test(dashboardComponentSource) &&
    /styleUrl:\s*'\.\/privacy-page\.component\.scss'/.test(privacyComponentSource) &&
    /styleUrl:\s*'\.\/support-page\.component\.scss'/.test(supportComponentSource),
  'all canonical route components wire component-scoped styleUrl files'
);

assert(
  /\.hero\b/.test(homeStyleSource) &&
    /\.about-hero\b/.test(aboutStyleSource) &&
    /\.dash-preview\b/.test(dashboardStyleSource) &&
    /\.privacy-page\b/.test(privacyStyleSource) &&
    /\.faq-section\b/.test(supportStyleSource),
  'route-specific SCSS files preserve core page visual selector anchors'
);

assert(
  /media\.addEventListener\('change',\s*\(e\)\s*=>\s*this\.applyDark\(e\.matches\)\)/.test(themeServiceSource),
  'theme service updates theme on system preference changes'
);

assert(
  /if\s*\(isDark\)\s*\{[\s\S]*removeAttribute\('data-theme'\)[\s\S]*\}\s*else\s*\{[\s\S]*setAttribute\('data-theme',\s*'light'\)/.test(themeServiceSource),
  'theme service maps dark mode to default theme and light mode to data-theme=\"light\"'
);

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
