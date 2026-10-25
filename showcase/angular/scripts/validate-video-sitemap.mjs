import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const schema = fileURLToPath(new URL('./schemas/video-sitemap-validation.xsd', import.meta.url));
const videoCount = 'count(//*[local-name()="video" and namespace-uri()="http://www.google.com/schemas/sitemap-video/1.1"])';

export function validateVideoSitemap(xml, { xmlLint = 'xmllint' } = {}) {
  function run(args, label) {
    const result = spawnSync(xmlLint, ['--nonet', ...args, '-'], {
      input: xml,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error?.code === 'ENOENT') {
      throw new Error('Video sitemap validation requires xmllint. Install libxml2-utils on Debian/Ubuntu or use macOS /usr/bin/xmllint.');
    }
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`${label}: ${result.stderr.trim() || `xmllint exited with status ${result.status}`}`);
    return result.stdout.trim();
  }

  run(['--noout'], 'Malformed sitemap XML');
  run(['--noout', '--schema', schema], 'Video sitemap XSD validation failed');
  const count = Number(run(['--xpath', videoCount], 'Cannot count sitemap videos'));
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Video sitemap must contain at least one namespaced video entry.');
  return count;
}
