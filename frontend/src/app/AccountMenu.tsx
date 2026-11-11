import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronIcon, MoonIcon, PersonIcon, ShieldIcon, SignOutIcon, SunIcon } from './icons';
import { WorkspaceGroupList } from './WorkspaceSwitcher';
import type { WorkspaceGroup, WorkspaceRow } from './workspaces';
import { initials } from '../lib/text';
import { useTheme } from '../lib/theme';

/**
 * Who you are, and what you can do about it.
 *
 * Keeps who is signed in, Appearance, "Sales console" / "Platform admin" (for operators),
 * My account, and Sign out. In the admin area (which has no sidebar switcher), also
 * offers "Back to <name>" and the grouped workspace list.
 */
export function AccountMenu({
  name,
  contact,
  role,
  busy = false,
  busyKey = null,
  platformLabel = null,
  onOpenPlatform,
  backToLabel = null,
  onBackTo,
  workspaceGroups = [],
  onChooseWorkspace,
  onSignOut,
  accountPath = '/app/account',
}: {
  name: string;
  /** Email or phone, whichever the account has. */
  contact: string | null;
  role: string | null;
  busy?: boolean;
  busyKey?: string | null;
  /** "Platform admin" for superadmins, "Sales console" for salespeople, null otherwise. */
  platformLabel?: string | null;
  onOpenPlatform?: () => void;
  /** In the admin area: "Back to <name>" for the remembered or first-available place. */
  backToLabel?: string | null;
  onBackTo?: () => void;
  /** In the admin area: the same grouped workspace rows as the sidebar switcher. */
  workspaceGroups?: readonly WorkspaceGroup[];
  onChooseWorkspace?: (row: WorkspaceRow, closeMenu: () => void) => void;
  onSignOut: () => void;
  /** Where "My account" goes — null hides it. */
  accountPath?: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Closes on Escape and on any click elsewhere. Bound only while open.
  useEffect(() => {
    if (!open) return undefined;

    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sh__account" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="sh__avatar sh__avatar--button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((was) => !was)}
      >
        {initials(name)}
      </button>

      {open ? (
        <div className="sh__menu" role="menu">
          <div className="sh__menuwho">
            <span className="sh__menulabel">Signed in as</span>
            <strong>{name}</strong>
            {contact ? <span className="sh__menucontact">{contact}</span> : null}
            {role ? <span className="sh__menurole">{role}</span> : null}
          </div>

          {backToLabel && onBackTo ? (
            <button
              type="button"
              role="menuitem"
              className="sh__menuitem sh__menuitem--back"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onBackTo();
              }}
            >
              <ChevronIcon direction="left" />
              {backToLabel}
            </button>
          ) : null}

          {workspaceGroups.length > 0 && onChooseWorkspace ? (
            <div className="sh__places">
              <WorkspaceGroupList
                groups={workspaceGroups}
                busyKey={busyKey}
                onChoose={(row) => onChooseWorkspace(row, () => setOpen(false))}
              />
            </div>
          ) : null}

          <ThemeChoice />

          {platformLabel && onOpenPlatform ? (
            <button
              type="button"
              role="menuitem"
              className="sh__menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onOpenPlatform();
              }}
            >
              <ShieldIcon />
              {platformLabel}
            </button>
          ) : null}

          {accountPath ? (
            <Link className="sh__menuitem" role="menuitem" to={accountPath} onClick={() => setOpen(false)}>
              <PersonIcon />
              My account
            </Link>
          ) : null}

          <button className="sh__menuitem" role="menuitem" type="button" onClick={onSignOut}>
            <SignOutIcon />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Light or dark, for this device. Two options, not three: "follow system" makes the
 * product look different on every machine.
 */
function ThemeChoice() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="sh__theme" role="group" aria-label="Appearance">
      <span className="sh__themelabel">Appearance</span>

      <div className="sh__themeswitch">
        {(['light', 'dark'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`sh__themeopt ${theme === option ? 'is-on' : ''}`}
            aria-pressed={theme === option}
            onClick={() => setTheme(option)}
          >
            {option === 'light' ? <SunIcon /> : <MoonIcon />}
            {option === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
    </div>
  );
}
