export type MarkdownFormat = 'heading' | 'bold' | 'italic' | 'bullets' | 'numbers' | 'link';

/** Applies a toolbar action to `value` with the selection [start, end); returns the new text and selection. */
export function applyMarkdownFormat(
  value: string,
  start: number,
  end: number,
  kind: MarkdownFormat,
): { value: string; start: number; end: number } {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (kind === 'bold' || kind === 'italic') {
    const mark = kind === 'bold' ? '**' : '*';
    const inner = selected || (kind === 'bold' ? 'bold text' : 'italic text');
    const next = `${before}${mark}${inner}${mark}${after}`;
    return {
      value: next,
      start: start + mark.length,
      end: start + mark.length + inner.length,
    };
  }

  if (kind === 'link') {
    const text = selected || 'link text';
    const next = `${before}[${text}](https://)${after}`;
    const urlStart = start + text.length + 3;
    return { value: next, start: urlStart, end: urlStart + 'https://'.length };
  }

  // Line actions: expand the selection to whole lines.
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end > start ? end - 1 : end);
  const lineEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const strip = (l: string) => l.replace(/^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+)/, '');
  const changed = lines
    .map((l, i) =>
      kind === 'heading' ? `## ${strip(l)}` : kind === 'bullets' ? `- ${strip(l)}` : `${i + 1}. ${strip(l)}`,
    )
    .join('\n');
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd);
  return { value: next, start: lineStart, end: lineStart + changed.length };
}
