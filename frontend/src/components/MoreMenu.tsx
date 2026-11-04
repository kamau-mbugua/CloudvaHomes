import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { menuPosition, nextEnabled } from '../lib/menu';

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive: shown last, in red, after a separator. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A "More" button with a menu of the less-used actions. Rendered through a portal with a
 * fixed position, so table wrappers (`overflow: auto`) never clip it.
 *
 * Keyboard: Enter/Space/↓ open it on the first item, ↑/↓ move (skipping disabled items),
 * Home/End jump, Esc closes and returns focus to the button, Tab closes. Clicking outside,
 * scrolling or resizing closes it too.
 */
export function MoreMenu({
  items,
  label = 'More',
  size = 'sm',
  ariaLabel,
}: {
  items: MoreMenuItem[];
  label?: string;
  size?: 'sm' | 'md';
  /** Names what the menu acts on, e.g. "More actions for A1". Defaults to `label`. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // Danger items go last, behind a separator.
  const ordered = [...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)];
  const firstDanger = ordered.findIndex((i) => i.danger);
  const disabled = ordered.map((i) => !!i.disabled);

  const close = (refocus: boolean) => {
    setOpen(false);
    setActive(-1);
    setPos(null);
    if (refocus) triggerRef.current?.focus();
  };

  const openAt = (index: number) => {
    setOpen(true);
    setActive(index);
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    setPos(menuPosition(t, { width: m.width, height: m.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [open]);

  useEffect(() => {
    if (open && pos && active >= 0) itemRefs.current[active]?.focus();
  }, [open, pos, active]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onMove = () => close(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  if (ordered.length === 0) return null;

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openAt(nextEnabled(disabled, -1, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(nextEnabled(disabled, -1, -1));
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => number> = {
      ArrowDown: () => nextEnabled(disabled, active, 1),
      ArrowUp: () => nextEnabled(disabled, active, -1),
      Home: () => nextEnabled(disabled, -1, 1),
      End: () => nextEnabled(disabled, -1, -1),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setActive(moves[e.key]!());
    } else if (e.key === 'Escape') {
      // Stopped so a drawer or sheet around the menu doesn't close as well.
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      // Back to the button, so focus isn't lost with the menu (and a drawer's focus trap
      // carries on from there).
      e.preventDefault();
      close(true);
    }
  };

  const choose = (item: MoreMenuItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`nx-btn ${size === 'sm' ? 'nx-btn--sm ' : ''}mm__trigger`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openAt(nextEnabled(disabled, -1, 1)))}
        onKeyDown={onTriggerKey}
      >
        {label}
        <span className="mm__caret" aria-hidden="true">▾</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="mm"
              role="menu"
              aria-label={ariaLabel ?? label}
              style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
              onKeyDown={onMenuKey}
            >
              {ordered.map((item, i) => (
                <div key={`${item.label}-${i}`} role="none">
                  {i === firstDanger && i > 0 ? <div className="mm__sep" role="separator" /> : null}
                  <button
                    ref={(el) => { itemRefs.current[i] = el; }}
                    type="button"
                    role="menuitem"
                    tabIndex={i === active ? 0 : -1}
                    className={`mm__item${item.danger ? ' mm__item--danger' : ''}`}
                    aria-disabled={item.disabled || undefined}
                    onClick={() => choose(item)}
                    onMouseEnter={() => !item.disabled && setActive(i)}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
