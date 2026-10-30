/**
 * Every permission in the system (design §4.5): `resource:action`. The role editor renders
 * this catalogue; guards check against it. Adding a feature = add its permissions here (and to
 * the system-role defaults below if the default roles should have them).
 */
export interface PermissionGroup {
  group: string;
  label: string;
  permissions: { key: string; label: string }[];
}

const crud = (resource: string, noun: string, actions = ['view', 'create', 'update', 'delete']) =>
  actions.map((a) => ({
    key: `${resource}:${a}`,
    label:
      {
        view: `View ${noun}`,
        create: `Add ${noun}`,
        update: `Edit ${noun}`,
        delete: `Delete ${noun}`,
      }[a] ?? a,
  }));

export const PERMISSION_CATALOGUE: PermissionGroup[] = [
  {
    group: 'landlords',
    label: 'Landlords (agencies)',
    permissions: [
      ...crud('landlords', 'landlords'),
      ...crud('agreements', 'management agreements'),
      ...crud('remittances', 'remittances', ['view', 'create']),
      { key: 'remittances:approve', label: 'Approve remittances' },
      { key: 'remittances:pay', label: 'Mark remittances paid' },
    ],
  },
  {
    group: 'portfolio',
    label: 'Properties & units',
    permissions: [
      ...crud('properties', 'properties'),
      ...crud('units', 'units'),
      ...crud('unit-categories', 'unit types, categories and features'),
    ],
  },
  {
    group: 'tenants',
    label: 'Tenants',
    permissions: [
      ...crud('tenants', 'tenants'),
      ...crud('tenancies', 'tenancies (move-in / move-out)'),
    ],
  },
  {
    group: 'billing',
    label: 'Billing',
    permissions: [
      ...crud('invoices', 'invoices', ['view', 'create', 'update']),
      { key: 'invoices:void', label: 'Void invoices / issue credit notes' },
      ...crud('meters', 'meters and readings'),
      ...crud('charges', 'charges and move-in fees'),
    ],
  },
  {
    group: 'money',
    label: 'Money',
    permissions: [
      ...crud('payments', 'payments', ['view', 'create']),
      { key: 'payments:refund', label: 'Reverse or refund payments' },
      ...crud('reconciliation', 'reconciliation', ['view', 'update']),
      { key: 'channels:view', label: 'View payment channels' },
      { key: 'channels:manage', label: 'Add or change payment channels' },
    ],
  },
  {
    group: 'expenses',
    label: 'Expenses',
    permissions: crud('expenses', 'expenses'),
  },
  {
    group: 'maintenance',
    label: 'Maintenance',
    permissions: crud('maintenance', 'maintenance requests', ['view', 'create', 'update']),
  },
  {
    group: 'reports',
    label: 'Reports',
    permissions: [{ key: 'reports:view', label: 'View reports and dashboard figures' }],
  },
  {
    group: 'admin',
    label: 'Administration',
    permissions: [
      ...crud('users', 'users'),
      ...crud('roles', 'roles'),
      { key: 'settings:view', label: 'View organisation settings' },
      { key: 'settings:update', label: 'Change organisation settings' },
      { key: 'audit:view', label: 'View the audit log' },
    ],
  },
];

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_CATALOGUE.flatMap((g) =>
  g.permissions.map((p) => p.key),
);
const KNOWN = new Set(ALL_PERMISSIONS);

export function isKnownPermission(key: string): boolean {
  return KNOWN.has(key);
}

const VIEW_ALL = ALL_PERMISSIONS.filter((p) => p.endsWith(':view'));

/** Default permissions for the four roles every organisation starts with. Owner = everything. */
export const SYSTEM_ROLE_DEFAULTS = {
  OWNER: {
    name: 'Owner',
    description: 'Full access, including users, roles and payment channels.',
    permissions: [...ALL_PERMISSIONS],
  },
  MANAGER: {
    name: 'Manager',
    description:
      'Runs day-to-day operations. Cannot change roles, payment channels or approve payouts.',
    permissions: ALL_PERMISSIONS.filter(
      (p) =>
        !p.startsWith('roles:') &&
        ![
          'channels:manage',
          'remittances:approve',
          'remittances:pay',
          'payments:refund',
          'users:delete',
          'settings:update',
        ].includes(p),
    ),
  },
  ACCOUNTANT: {
    name: 'Accountant',
    description: 'Invoices, payments, reconciliation, expenses and remittances.',
    permissions: [
      ...VIEW_ALL.filter((p) => !['users:view', 'roles:view', 'audit:view'].includes(p)),
      'invoices:create',
      'invoices:update',
      'invoices:void',
      'payments:create',
      'payments:refund',
      'reconciliation:update',
      'expenses:create',
      'expenses:update',
      'remittances:create',
      'remittances:pay',
    ],
  },
  CARETAKER: {
    name: 'Caretaker',
    description: 'Meter readings, unit status and tenant move-in/out on site. No money settings.',
    permissions: [
      'properties:view',
      'units:view',
      'units:update',
      'tenants:view',
      'tenants:create',
      'tenancies:view',
      'tenancies:create',
      'tenancies:update',
      'meters:view',
      'meters:create',
      'meters:update',
      'maintenance:view',
      'maintenance:create',
      'maintenance:update',
    ],
  },
} as const satisfies Record<
  string,
  { name: string; description: string; permissions: readonly string[] }
>;

export type SystemRole = keyof typeof SYSTEM_ROLE_DEFAULTS;
