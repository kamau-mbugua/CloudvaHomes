import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { badgeCount, bestEntry, countText, groupBadgeCount } from './navigation';
import type { GroupId, NavBadge, NavGroup } from './navigation';
import {
  BuildingIcon, CashIcon, ChartIcon, ChevronIcon, CogIcon, HomeIcon, InvoiceIcon, KeyIcon,
  PeopleIcon, ReceiptIcon,
} from './icons';
import { BrandIcon } from '../components/BrandMark';

/**
 * The org app's sidebar — ported from pos-react's merchant Sidebar.
 *
 * Behaviours kept from the source:
 *
 * - **The group holding the current page opens itself**, and stays open.
 * - **Only one group is open at a time** unless another is opened deliberately.
 * - **Collapsing gives icons only**; `title` brings the label back on hover.
 *
 * Active state comes from `bestEntry` (longest path-segment prefix), not NavLink's own
 * matching, so exactly one line is ever lit.
 */

const ICONS: Record<GroupId, ReactNode> = {
  dashboard: <HomeIcon />,
  landlords: <KeyIcon />,
  properties: <BuildingIcon />,
  tenants: <PeopleIcon />,
  billing: <InvoiceIcon />,
  money: <CashIcon />,
  expenses: <ReceiptIcon />,
  reports: <ChartIcon />,
  settings: <CogIcon />,
  'admin-overview': <HomeIcon />,
  'admin-organizations': <BuildingIcon />,
  'admin-billing': <InvoiceIcon />,
  'admin-reports': <ChartIcon />,
  'admin-platform': <CogIcon />,
  'admin-plans': <ReceiptIcon />,
  'admin-invoices': <InvoiceIcon />,
  'admin-settings': <CogIcon />,
};

export function Sidebar({
  groups,
  orgName,
  label = 'Main',
  collapsed,
  onToggleCollapsed,
  onNavigate,
  counts = {},
}: {
  /** The navigation this person may see (already permission-filtered). */
  groups: NavGroup[];
  orgName: string;
  /** Names the menu for screen readers; the admin area says so. */
  label?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  /** Live counts for entries with a `badge` (e.g. unmatched M-Pesa transactions). */
  counts?: Partial<Record<NavBadge, number>>;
}) {
  const location = useLocation();
  const here = bestEntry(groups, `${location.pathname}${location.search}`);
  const current = here?.group.id ?? null;

  /**
   * Which group the person has opened. `undefined` follows the current page; a GroupId is
   * their choice; `null` means they deliberately shut the current section, which must not
   * spring back open just because the page lives there.
   */
  const [opened, setOpened] = useState<GroupId | null | undefined>(undefined);
  const openGroup = opened === undefined ? current : opened;

  return (
    <nav className={`sb ${collapsed ? 'is-collapsed' : ''}`} aria-label={label}>
      <div className="sb__brand">
        <span className="sb__mark" aria-hidden="true">
          <BrandIcon tone="navy" size={22} />
        </span>
        <span className="sb__brandname" title={orgName}>{orgName}</span>

        <button
          type="button"
          className="sb__collapse"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
          title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      <div className="sb__scroll">
        {groups.map((group) => {
          const isOpen = openGroup === group.id;
          const isCurrent = current === group.id;

          // A group that is itself a page (Dashboard, Expenses, Reports) is a link.
          if (group.entry && group.children.length === 0) {
            const active = here?.entry.to === group.entry.to;
            return (
              <Link
                key={group.id}
                to={group.entry.to}
                onClick={onNavigate}
                title={group.label}
                aria-current={active ? 'page' : undefined}
                className={`sb__item ${active ? 'is-active' : ''}`}
              >
                <span className="sb__icon">{ICONS[group.id]}</span>
                <span className="sb__label">{group.label}</span>
              </Link>
            );
          }

          return (
            <div className="sb__group" key={group.id}>
              <button
                type="button"
                className={`sb__item sb__toggle ${isCurrent ? 'is-current' : ''}`}
                aria-expanded={isOpen && !collapsed}
                title={group.label}
                onClick={() => {
                  // Collapsed, there is no room for children: expand the rail and open
                  // the group in one tap rather than doing nothing.
                  if (collapsed) {
                    onToggleCollapsed();
                    setOpened(group.id);
                    return;
                  }
                  setOpened(isOpen ? null : group.id);
                }}
              >
                <span className="sb__icon">{ICONS[group.id]}</span>
                <span className="sb__label">{group.label}</span>
                {/* Closed (or collapsed to icons), the group carries its children's count. */}
                {(!isOpen || collapsed) && countText(groupBadgeCount(group, counts)) ? (
                  <span className="sb__count sb__count--alert" aria-label={`${groupBadgeCount(group, counts)} waiting`}>
                    {countText(groupBadgeCount(group, counts))}
                  </span>
                ) : null}
                <span className={`sb__chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true">
                  <ChevronIcon direction="right" />
                </span>
              </button>

              {isOpen && !collapsed ? (
                <div className="sb__children">
                  {group.children.map((child) => {
                    const active = here?.entry.to === child.to;
                    const count = countText(badgeCount(child, counts));
                    return (
                      <Link
                        key={child.to}
                        to={child.to}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={`sb__child ${count ? 'sb__child--count' : ''} ${active ? 'is-active' : ''}`}
                      >
                        {count ? (
                          <>
                            <span className="sb__childlabel">{child.label}</span>
                            <span className="sb__count sb__count--alert" aria-label={`${badgeCount(child, counts)} waiting`}>{count}</span>
                          </>
                        ) : child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
