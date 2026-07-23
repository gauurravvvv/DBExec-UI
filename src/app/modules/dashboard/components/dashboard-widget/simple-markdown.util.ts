/**
 * simple-markdown.util — a tiny, dependency-free, SAFE markdown → HTML
 * renderer for dashboard text widgets (Dashboard & Analysis v2, Track E3).
 *
 * The app ships no markdown library, and a dashboard text widget only
 * needs a small subset: headings, bold/italic/code, links, lists, and
 * paragraphs. Correctness-critical property: ALL input is HTML-escaped
 * FIRST, so no author-supplied HTML/script can ever reach the DOM — the
 * converter then re-introduces only the fixed, known-safe tags for the
 * markdown constructs it recognises. Links are restricted to http(s)/
 * mailto schemes (no javascript: URLs) and open in a new tab with
 * rel="noopener noreferrer".
 *
 * The result is still passed through DomSanitizer in the component before
 * binding, so this is defence-in-depth, not the only guard.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow safe link schemes; everything else becomes plain text. */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  // relative links (start with / or #) are safe too
  if (/^[/#]/.test(trimmed)) return trimmed;
  return null;
}

/** Inline: bold, italic, inline code, links. Operates on escaped text. */
function renderInline(text: string): string {
  let out = text;

  // inline code first so its contents aren't further transformed
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // links [label](url) — label already escaped; validate href scheme
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => {
      const href = safeHref(url);
      if (!href) return label;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );

  // bold **x** then italic *x* / _x_
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  out = out.replace(
    /(^|[^*])\*([^*]+)\*/g,
    (_m, pre, i) => `${pre}<em>${i}</em>`,
  );
  out = out.replace(
    /(^|[^_])_([^_]+)_/g,
    (_m, pre, i) => `${pre}<em>${i}</em>`,
  );

  return out;
}

/**
 * Convert a limited markdown string to safe HTML. Block-level support:
 * `# … ######` headings, `- ` / `* ` unordered lists, `1. ` ordered
 * lists, blank-line-separated paragraphs. Everything is escaped up front.
 */
export function renderSimpleMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  const escaped = escapeHtml(String(md));
  const lines = escaped.split(/\r?\n/);

  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${renderInline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(ul[1].trim())}</li>`);
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${renderInline(ol[1].trim())}</li>`);
      continue;
    }

    // plain text line → accumulate into a paragraph
    closeList();
    para.push(line.trim());
  }

  flushPara();
  closeList();
  return html.join('');
}
