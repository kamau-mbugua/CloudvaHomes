import { useRef, useState } from 'react';
import { Markdown } from './markdown';
import { type MarkdownFormat, applyMarkdownFormat } from './markdownFormat';

const TOOLS: { kind: MarkdownFormat; label: string; title: string }[] = [
  { kind: 'heading', label: 'H', title: 'Section heading' },
  { kind: 'bold', label: 'B', title: 'Bold' },
  { kind: 'italic', label: 'I', title: 'Italic' },
  { kind: 'bullets', label: '• List', title: 'Bullet list' },
  { kind: 'numbers', label: '1. List', title: 'Numbered list' },
  { kind: 'link', label: 'Link', title: 'Link' },
];

/** A textarea with a small Markdown toolbar and a Write / Preview switch. */
export function MarkdownEditor({
  id,
  value,
  onChange,
  disabled,
  rows = 14,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(kind: MarkdownFormat) {
    const el = ref.current;
    if (!el) return;
    const r = applyMarkdownFormat(value, el.selectionStart, el.selectionEnd, kind);
    if (maxLength && r.value.length > maxLength) return;
    onChange(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  }

  return (
    <div className="md-editor">
      <div className="md-editor__bar">
        <div className="md-editor__tabs" role="tablist" aria-label="Editor mode">
          {(['write', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`md-editor__tab${mode === m ? ' is-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
        {mode === 'write' ? (
          <div className="md-editor__tools" role="toolbar" aria-label="Formatting">
            {TOOLS.map((t) => (
              <button
                key={t.kind}
                type="button"
                className={`md-editor__tool md-editor__tool--${t.kind}`}
                title={t.title}
                aria-label={t.title}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(t.kind)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mode === 'write' ? (
        <textarea
          ref={ref}
          id={id}
          className="md-editor__input"
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="md-editor__preview">
          {value.trim() ? (
            <Markdown text={value} className="md" />
          ) : (
            <p className="ad__muted">Nothing to preview yet.</p>
          )}
        </div>
      )}
      <p className="md-editor__hint">
        <code>## Heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>- list</code> ·{' '}
        <code>[text](https://…)</code>
        {maxLength ? (
          <span className="md-editor__count">
            {value.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        ) : null}
      </p>
    </div>
  );
}
