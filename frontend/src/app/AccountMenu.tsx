import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BuildingIcon, CheckIcon, HomeIcon, KeyIcon, MoonIcon, PersonIcon, ShieldIcon, SignOutIcon, SunIcon, SwitchIcon } from './icons';
import { initials } from '../lib/text';
import { useTheme } from '../lib/theme';
import type { OrganizationMembership } from '../lib/auth/types';

/**
 * Who you are, and what you can do about it — ported from pos-react's AccountMenu.
 *
 * Says whose account this is (a shared office computer may not belong to the person in
 * front of it) and in which organisation, carries the Appearance choice, the organisation
 * switcher (only for people in more than one), My account, and Sign out — the action you
 * want least often, so it is not a permanent button.
 */
export function AccountMenu({
  name,
  contact,
  role,
  organizations,
  activeOrganizationId,
  switchingTo,
  onSwitch,
  onSignOut,
  ownerPortal = false,
  tenantPortal = false,
  platformAdmin = false,
  staffApp = false,
  accountPath = '/app/account',
}: {
  name: string;
  /** Email or phone, whichever the account has. */
  contact: string | null;
  role: string | null;
  organizations: OrganizationMembership[];
  activeOrganizationId: string | null;
  /** The organisation a switch is in progress to. */
  switchingTo: string | null;
  onSwitch: (organizationId: string) => void;
  onSignOut: () => void;
  /** The person is also a landlord of an agency: offer the owner portal (phase 6b). */
  ownerPortal?: boolean;
  /** The person is also a tenant somewhere: offer the tenant portal (phase 7). */
  tenantPortal?: boolean;
  /** A platform admin in the staff app: offer the admin area (phase 8). */
  platformAdmin?: boolean;
  /** In the admin area, for someone who is also staff somewhere: offer the staff app. */
  staffApp?: boolean;
  /** Where "My account" goes — the admin area has its own, for admins with no organisation. */
  accountPath?: string;
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

          {organizations.length > 1 ? (
            <div className="sh__orgs" role="group" aria-label="Switch organisation">
              <span className="sh__themelabel"><SwitchIcon /> Organisation</span>
              {organizations.map((org) => {
                const active = org.id === activeOrganizationId;
                return (
                  <button
                    key={org.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`sh__orgitem ${active ? 'is-on' : ''}`}
                    disabled={switchingTo !== null}
                    onClick={() => {
                      if (active) return;
                      onSwitch(org.id);
                    }}
                  >
                    <span className="sh__orgname">
                      <strong>{org.name}</strong>
                      <span>{switchingTo === org.id ? 'Switching…' : org.roleName}</span>
                    </span>
                    {active ? <CheckIcon /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <ThemeChoice />

          {platformAdmin ? (
            <Link className="sh__menuitem" role="menuitem" to="/admin" onClick={() => setOpen(false)}>
              <ShieldIcon />
              Platform admin
            </Link>
          ) : null}

          {staffApp ? (
            <Link className="sh__menuitem" role="menuitem" to="/app" onClick={() => setOpen(false)}>
              <BuildingIcon />
              Staff app
            </Link>
          ) : null}

          {ownerPortal ? (
            <Link className="sh__menuitem" role="menuitem" to="/owner" onClick={() => setOpen(false)}>
              <HomeIcon />
              Owner portal
            </Link>
          ) : null}

          {tenantPortal ? (
            <Link className="sh__menuitem" role="menuitem" to="/tenant" onClick={() => setOpen(false)}>
              <KeyIcon />
              Tenant portal
            </Link>
          ) : null}

          <Link className="sh__menuitem" role="menuitem" to={accountPath} onClick={() => setOpen(false)}>
            <PersonIcon />
            My account
          </Link>

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
