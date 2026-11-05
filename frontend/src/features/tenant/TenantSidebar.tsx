import { NavLink } from 'react-router-dom';
import { BrandIcon } from '../../components/BrandMark';
import { ChevronIcon } from '../../app/icons';
import { TENANT_MENU } from './tenantMenu';
import { ALL_HOMES, type HomeOption, type HomeScope } from './scope';

/**
 * The tenant side menu (tenant portal redesign): the home switcher at the top — hidden when
 * there is only one home — then the pages. Uses the staff sidebar's styles so both apps feel
 * the same; on a phone it is the same slide-in drawer.
 */
export function TenantSidebar({ options, scope, onScope, collapsed, onToggleCollapsed, onNavigate }: {
  options: HomeOption[];
  scope: HomeScope;
  onScope: (s: HomeScope) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}) {
  const value = scope.kind === 'home' ? scope.tenancyId : '';
  return (
    <nav className={`sb ${collapsed ? 'is-collapsed' : ''}`} aria-label="Tenant menu">
      <div className="sb__brand">
        <span className="sb__mark" aria-hidden="true"><BrandIcon tone="navy" size={22} /></span>
        <span className="sb__brandname">KodiHub</span>
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

      {options.length > 1 && !collapsed ? (
        <label className="tsb__switch">
          <span className="tsb__switchlabel">Showing</span>
          <select
            className="tsb__select"
            aria-label="Home"
            value={value}
            onChange={(e) => {
              const pick = options.find((o) => o.tenancyId === e.target.value);
              onScope(pick ? { kind: 'home', tenantId: pick.tenantId, tenancyId: pick.tenancyId } : ALL_HOMES);
              onNavigate();
            }}
          >
            <option value="">All my homes ({options.length})</option>
            {options.map((o) => <option key={o.tenancyId} value={o.tenancyId}>{o.label}</option>)}
          </select>
        </label>
      ) : null}

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
