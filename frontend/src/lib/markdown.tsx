import { Fragment, type ReactNode } from 'react';
import { parseInline, parseMarkdown } from './markdownParse';

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((n, i) => {
        if (n.t === 'strong') return <strong key={i}>{n.v}</strong>;
        if (n.t === 'em') return <em key={i}>{n.v}</em>;
        if (n.t === 'code') return <code key={i}>{n.v}</code>;
        if (n.t === 'link') {
          const external = /^https?:/i.test(n.href);
          return (
            <a key={i} href={n.href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
              {n.v}
            </a>
          );
        }
        return <Fragment key={i}>{n.v}</Fragment>;
      })}
    </>
  );
}

/** Renders Markdown as safe React elements. `className` styles the wrapper (e.g. `md`). */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  const nodes: ReactNode[] = blocks.map((b, i) => {
    switch (b.type) {
      case 'heading': {
        const Tag = `h${b.level + 1}` as 'h2' | 'h3' | 'h4';
        return (
          <Tag key={i}>
            <Inline text={b.text} />
          </Tag>
        );
      }
      case 'ul':
      case 'ol': {
        const List = b.type;
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} />
              </li>
            ))}
          </List>
        );
      }
      case 'quote':
        return (
          <blockquote key={i}>
            <Inline text={b.text} />
          </blockquote>
        );
      case 'hr':
        return <hr key={i} />;
      default:
        return (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        );
    }
  });
  return <div className={className}>{nodes}</div>;
}
