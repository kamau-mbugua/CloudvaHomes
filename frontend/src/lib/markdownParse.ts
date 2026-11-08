/**
 * A small Markdown reader for host-written pages (legal pages on booking sites). It produces a
 * plain block/inline tree that `Markdown` (markdown.tsx) turns into React elements — never raw
 * HTML — so whatever a host types, the page can't run script. Links are limited to http(s),
 * mailto, tel and same-site paths.
 *
 * Supported: # / ## / ### headings, paragraphs, - or * bullet lists, 1. numbered lists, > quotes,
 * --- dividers, **bold**, *italic* or _italic_, `code`, [text](link).
 */

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'hr' };

export type MdInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'em'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string };

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      blocks.push({
        type: 'heading',
        level: h[1]!.length as 1 | 2 | 3,
        text: h[2]!.trim(),
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const re = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i]!)) {
        items.push(re.exec(lines[i]!)![1]!.trim());
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        parts.push(QUOTE.exec(lines[i]!)![1]!.trim());
        i++;
      }
      blocks.push({ type: 'quote', text: parts.join(' ') });
      continue;
    }
    const parts: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !HEADING.test(lines[i]!) &&
      !RULE.test(lines[i]!) &&
      !BULLET.test(lines[i]!) &&
      !NUMBERED.test(lines[i]!) &&
      !QUOTE.test(lines[i]!)
    ) {
      parts.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', text: parts.join(' ') });
  }
  return blocks;
}

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^\/(?!\/)/.test(href) || href.startsWith('#')) return href;
  return null;
}

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+(?:\([^)\s]*\))?)\)/g;

export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  const push = (node: MdInline) => {
    const prev = out[out.length - 1];
    if (node.t === 'text' && prev?.t === 'text') prev.v += node.v;
    else out.push(node);
  };
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) push({ t: 'text', v: text.slice(last, at) });
    if (m[1] !== undefined) push({ t: 'strong', v: m[1] });
    else if (m[2] !== undefined) push({ t: 'em', v: m[2] });
    else if (m[3] !== undefined) push({ t: 'em', v: m[3] });
    else if (m[4] !== undefined) push({ t: 'code', v: m[4] });
    else {
      const href = safeHref(m[6]!);
      push(href ? { t: 'link', v: m[5]!, href } : { t: 'text', v: m[0] });
    }
    last = at + m[0].length;
  }
  if (last < text.length) push({ t: 'text', v: text.slice(last) });
  return out;
}
