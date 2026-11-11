import { NavLink } from 'react-router-dom';
import { ChevronIcon } from '../../app/icons';
import { WorkspaceSwitcher } from '../../app/WorkspaceSwitcher';
import { TENANT_MENU } from './tenantMenu';

/**
 * The tenant side menu: the workspace switcher at the top (replacing both the static
 * title and the old "Showing" dropdown so there is one picker, not two), then the pages.
 */
export function TenantSidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}) {
  return (
    <nav className={`sb ${collapsed ? 'is-collapsed' : ''}`} aria-label="Tenant menu">
      <div className="sb__brand">
        <WorkspaceSwitcher here="tenant" collapsed={collapsed} onChosen={onNavigate} />
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
        {TENANT_MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.end}
            onClick={onNavigate}
            title={m.label}
            className={({ isActive }) => `sb__item ${isActive ? 'is-active' : ''}`}
          >
            <span className="sb__icon">{m.icon}</span>
            <span className="sb__label">{m.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
