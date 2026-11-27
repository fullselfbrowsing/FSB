/**
 * A small CSS and SCSS reader shared by the design-system checks
 * (scripts/verify-design-system.mjs and scripts/check-style-literals.mjs).
 *
 * lexCss() walks a stylesheet once and returns every declaration together with
 * the chain of block headers it sits in, for example
 *   { prop: '--nav-height', value: '56px', context: ['@media (max-width: 768px)', ':root'] }
 *
 * It understands block and SCSS line comments, quoted strings, url(...), nested
 * blocks (SCSS nesting, @media, @keyframes, @font-face) and parentheses. It
 * evaluates nothing: values come back as written, with comments removed and
 * whitespace collapsed. A comment written on the same line, right after a
 * declaration's semicolon, is attached to that declaration as `trailing`.
 */

const URL_START = /^url\(/i;

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Normalises a selector or at-rule header so scopes compare as plain strings. */
export function normalizeHeader(header) {
  return collapse(header).replace(/\s*,\s*/g, ', ');
}

/** Normalises a declaration value for comparison: whitespace, comma spacing, hex case. */
export function normalizeValue(value) {
  return collapse(value)
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => hex.toLowerCase());
}

/**
 * @param {string} text stylesheet source
 * @param {{ scss?: boolean }} [options] scss enables `//` line comments
 * @returns {{ decls: Array<{prop:string,value:string,context:string[],line:number,comments:string[],trailing:string[]}> }}
 */
export function lexCss(text, { scss = false } = {}) {
  const decls = [];
  const stack = [];
  const n = text.length;
  let buf = '';
  let bufLine = 0;
  let comments = [];
  let line = 1;
  let parenDepth = 0;
  let lastDecl = null;
  let lastDeclLine = -1;
  let i = 0;

  const append = (chunk) => {
    if (bufLine === 0 && /\S/.test(chunk)) bufLine = line;
    buf += chunk;
  };

  const resetStatement = () => {
    buf = '';
    bufLine = 0;
    comments = [];
  };

  const takeComment = (body, startLine) => {
    const textBody = body.trim();
    if (lastDecl && startLine === lastDeclLine && buf.trim() === '') {
      lastDecl.trailing.push(textBody);
    } else {
      comments.push(textBody);
    }
  };

  const flushDeclaration = () => {
    const raw = buf.trim();
    if (!raw) {
      resetStatement();
      return null;
    }
    if (raw.startsWith('@')) {
      resetStatement();
      return null;
    }
    const colon = raw.indexOf(':');
    if (colon <= 0) {
      resetStatement();
      return null;
    }
    const decl = {
      prop: raw.slice(0, colon).trim(),
      value: collapse(raw.slice(colon + 1)),
      context: stack.slice(),
      line: bufLine || line,
      comments,
      trailing: []
    };
    decls.push(decl);
    resetStatement();
    return decl;
  };

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '\n') {
      line += 1;
      buf += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      const startLine = line;
      takeComment(text.slice(i + 2, end === -1 ? n : end), startLine);
      line += (text.slice(i, stop).match(/\n/g) || []).length;
      buf += ' ';
      i = stop;
      continue;
    }

    if (scss && c === '/' && next === '/' && parenDepth === 0) {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      takeComment(text.slice(i + 2, stop), line);
      i = stop;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      const chunk = text.slice(i, j + 1);
      append(chunk);
      line += (chunk.match(/\n/g) || []).length;
      i = j + 1;
      continue;
    }

    if ((c === 'u' || c === 'U') && URL_START.test(text.slice(i, i + 4)) && !/[\w-]/.test(text[i - 1] || '')) {
      let j = i + 4;
      while (j < n && /\s/.test(text[j])) j += 1;
      if (text[j] === '"' || text[j] === "'") {
        const quote = text[j];
        j += 1;
        while (j < n && text[j] !== quote) {
          if (text[j] === '\\') j += 1;
          j += 1;
        }
        j += 1;
      }
      while (j < n && text[j] !== ')') j += 1;
      const chunk = text.slice(i, j + 1);
      append(chunk);
      line += (chunk.match(/\n/g) || []).length;
      i = j + 1;
      continue;
    }

    if (c === '(') {
      parenDepth += 1;
      append(c);
      i += 1;
      continue;
    }

    if (c === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      append(c);
      i += 1;
      continue;
    }

    if (parenDepth === 0 && c === '{') {
      stack.push(normalizeHeader(buf));
      resetStatement();
      lastDecl = null;
      i += 1;
      continue;
    }

    if (parenDepth === 0 && c === ';') {
      const decl = flushDeclaration();
      if (decl) {
        lastDecl = decl;
        lastDeclLine = line;
      }
      i += 1;
      continue;
    }

    if (parenDepth === 0 && c === '}') {
      flushDeclaration();
      stack.pop();
      lastDecl = null;
      i += 1;
      continue;
    }

    append(c);
    i += 1;
  }

  flushDeclaration();
  return { decls };
}

/** The scope key used across the checks: block headers joined with ' > '. */
export function scopeKey(context) {
  return context.join(' > ');
}

/** Custom properties declared directly in one scope, keyed by name. */
export function customProperties(decls, scope) {
  const out = new Map();
  for (const decl of decls) {
    if (!decl.prop.startsWith('--')) continue;
    if (scopeKey(decl.context) !== scope) continue;
    out.set(decl.prop, decl);
  }
  return out;
}

/** True when a declaration carries a comment that starts with `marker`. */
export function hasMarker(decl, marker) {
  return [...decl.comments, ...decl.trailing].some((comment) => comment.startsWith(marker));
}

// A colour written as a literal: #rgb, #rgba, #rrggbb, #rrggbbaa (not an HTML
// entity such as &#9632; and not part of an id such as #add-button), or a
// colour function.
export const HEX_COLOR = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
export const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\(/gi;

/** url(...) bodies (including data URIs) are not counted: SVG fills there cannot use var(). */
export function stripUrls(value) {
  return value.replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)/gi, 'url()');
}

export function countColors(value) {
  const v = stripUrls(value);
  return (v.match(HEX_COLOR) || []).length + (v.match(COLOR_FUNCTION) || []).length;
}
