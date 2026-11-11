import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Sheet } from '../components/Sheet';
import { useSession } from '../lib/auth/useAuth';
import { CheckIcon } from './icons';
import { useWorkspaceActions } from './useWorkspaceActions';
import {
  countRows,
  currentWorkspace,
  filterRows,
  initials,
  rowKey,
  workspaceList,
  type PendingInvite,
  type WorkspaceGroup,
  type WorkspaceRow,
} from './workspaces';

function SelectorChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 9l4 -4l4 4" />
      <path d="M16 15l-4 4l-4 -4" />
    </svg>
  );
}

export function WorkspaceGroupList({
  groups,
  busyKey,
  onChoose,
}: {
  groups: readonly WorkspaceGroup[];
  busyKey: string | null;
  onChoose: (row: WorkspaceRow) => void;
}) {
  if (groups.length === 0) {
    return <p className="sb__wsempty">No matching places</p>;
  }

  return (
    <>
      {groups.map((group) => (
        <div className="sb__wsgroup" key={group.label} role="group" aria-label={group.label}>
          <h5 className="sb__wsheading">{group.label}</h5>
          {group.rows.map((row) => {
            const key = rowKey(row);
            const isCurrent = row.kind !== 'invited' && row.current;
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                disabled={busyKey !== null}
                className={`sb__wsrow ${isCurrent ? 'is-on' : ''}`}
                onClick={() => onChoose(row)}
              >
                <span className="sb__wsrowbadge" aria-hidden="true">
                  {initials(row.name)}
                </span>
                <span className="sb__wsrowtext">
                  <strong className="sb__wsrowname">{row.name}</strong>
                  <span className="sb__wsrowdetail">
                    {busyKey === key ? 'Switching…' : row.detail}
                  </span>
                </span>
                {row.kind === 'invited' ? (
                  <span className="sb__wstag">Invited</span>
                ) : isCurrent ? (
                  <span className="sb__wstick" aria-hidden="true">
                    <CheckIcon />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function InviteJoinSheet({
  invite,
  busy,
  onClose,
  onConfirm,
}: {
  invite: PendingInvite | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!invite) return null;
  const title = `Join ${invite.name} as ${invite.roleName}?`;
  return (
    <Sheet
      label={title}
      title={title}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="nx-btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="nx-btn nx-btn--primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </>
      }
    >
      <p>You will accept this invitation and open {invite.name} straight away.</p>
    </Sheet>
  );
}

export function WorkspaceSwitcher({
  here,
  collapsed = false,
  onChosen,
}: {
  here: 'staff' | 'tenant' | 'owner';
  collapsed?: boolean;
  onChosen?: () => void;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = useMemo(() => currentWorkspace(session, here), [session, here]);
  const groups = useMemo(() => workspaceList(session, here), [session, here]);
  const showSearch = useMemo(() => countRows(groups) > 6, [groups]);
  const visibleGroups = useMemo(
    () => (showSearch ? filterRows(groups, query) : groups),
    [groups, query, showSearch],
  );

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    setQuery('');
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const closeQuietly = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const { busyKey, pendingInvite, setPendingInvite, chooseRow, confirmInvite } =
    useWorkspaceActions(here, onChosen);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        closeQuietly();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [closeQuietly, open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (showSearch && searchRef.current) {
        searchRef.current.focus();
        return;
      }
      const checked = menuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      );
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
      (checked ?? first)?.focus();
    });
  }, [open, showSearch]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusTrigger();
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') ??
        [],
    );
    if (items.length === 0) return;

    const active = document.activeElement;
    const index = items.indexOf(active as HTMLButtonElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = index < 0 ? 0 : (index + 1) % items.length;
      items[next]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = index <= 0 ? items.length - 1 : index - 1;
      items[prev]?.focus();
    } else if (event.key === 'Home' && active !== searchRef.current) {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End' && active !== searchRef.current) {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Enter' && active === searchRef.current) {
      event.preventDefault();
      items[0]?.click();
    }
  };

  return (
    <div className={`sb__wswrap ${here === 'owner' ? 'sb__wswrap--header' : ''}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`sb__ws ${open ? 'is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${current.name} (${current.detail}) — switch place`}
        title={collapsed ? `${current.name} · ${current.detail}` : undefined}
        onClick={() => {
          if (open) {
            closeQuietly();
          } else {
            setQuery('');
            setOpen(true);
          }
        }}
      >
        <span className="sb__wsbadge" aria-hidden="true">
          {current.badge}
        </span>
        <span className="sb__wstext">
          <strong className="sb__wsname">{current.name}</strong>
          <span className="sb__wsdetail">{current.detail}</span>
        </span>
        <span className="sb__wscaret" aria-hidden="true">
          <SelectorChevron />
        </span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="sb__wsmenu"
          role="menu"
          aria-label="Places"
          onKeyDown={onMenuKeyDown}
        >
          {showSearch ? (
            <div className="sb__wssearch">
              <input
                ref={searchRef}
                type="search"
                className="sb__wsinput"
                placeholder="Search places…"
                aria-label="Search places"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : null}

          <div className="sb__wslist">
            <WorkspaceGroupList
              groups={visibleGroups}
              busyKey={busyKey}
              onChoose={(row) => void chooseRow(row, closeQuietly)}
            />
          </div>
        </div>
      ) : null}

      <InviteJoinSheet
        invite={pendingInvite}
        busy={pendingInvite !== null && busyKey === rowKey(pendingInvite)}
        onClose={() => setPendingInvite(null)}
        onConfirm={() => void confirmInvite()}
      />
    </div>
  );
}
