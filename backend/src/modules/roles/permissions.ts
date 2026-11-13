import type { OrgKind } from '../../generated/prisma/client.js';

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

const STAYS_PERMISSIONS = [
  ...crud('listings', 'listings'),
  ...crud('bookings', 'bookings', ['view', 'create', 'update']),
  { key: 'bookings:cancel', label: 'Cancel bookings' },
  ...crud('stay-payments', 'stay payments', ['view', 'create']),
  { key: 'stay-payments:refund', label: 'Refund, void or write off stay payments' },
  ...crud('guests', 'guests', ['view', 'update']),
  ...crud('cleaning', 'cleaning tasks', ['view', 'update']),
  ...crud('site', 'booking site settings', ['view', 'update']),
];

const STAYS_KEY_SET = new Set(STAYS_PERMISSIONS.map((p) => p.key));

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
      { key: 'messages:send', label: 'Send notices to tenants (SMS, email, app)' },
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
    group: 'stays',
    label: 'Short stays',
    permissions: STAYS_PERMISSIONS,
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
    group: 'sms',
    label: 'SMS',
    permissions: [
      { key: 'sms:view', label: 'See SMS balance and usage' },
      { key: 'sms:manage', label: 'Buy SMS units and change SMS settings' },
    ],
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
const RENT_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !STAYS_KEY_SET.has(p));
const RENT_VIEW_ALL = RENT_PERMISSIONS.filter((p) => p.endsWith(':view'));

export type SystemRole = 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'CARETAKER';

export interface RoleDefault {
  name: string;
  description: string;
  permissions: readonly string[];
}

export function systemRoleDefaults(kind: OrgKind): Record<SystemRole, RoleDefault> {
  if (kind === 'HOST') {
    return {
      OWNER: {
        name: 'Owner',
        description: 'Full access, including users, roles and payment channels.',
        permissions: [...ALL_PERMISSIONS],
      },
      MANAGER: {
        name: 'Manager',
        description:
          'Runs day-to-day operations. Cannot change roles, payment channels or refund stay payments.',
        permissions: ALL_PERMISSIONS.filter(
          (p) =>
            !p.startsWith('roles:') &&
            ![
              'channels:manage',
              'stay-payments:refund',
              'settings:update',
              'users:delete',
              'sms:manage',
            ].includes(p),
        ),
      },
      ACCOUNTANT: {
        name: 'Accountant',
        description: 'Stay payments, refunds, expenses and reports.',
        permissions: [
          ...VIEW_ALL.filter((p) => !['users:view', 'roles:view', 'audit:view'].includes(p)),
          'stay-payments:create',
          'stay-payments:refund',
          'expenses:create',
          'expenses:update',
        ],
      },
      CARETAKER: {
        name: 'Caretaker',
        description: 'Arrivals, departures, check-in/out and cleaning on site. No money settings.',
        permissions: [
          'properties:view',
          'listings:view',
          'bookings:view',
          'bookings:update',
          'cleaning:view',
          'cleaning:update',
          'maintenance:view',
          'maintenance:create',
          'maintenance:update',
        ],
      },
    };
  }

  return {
    OWNER: {
      name: 'Owner',
      description: 'Full access, including users, roles and payment channels.',
      permissions: [...ALL_PERMISSIONS],
    },
    MANAGER: {
      name: 'Manager',
      description:
        'Runs day-to-day operations. Cannot change roles, payment channels or approve payouts.',
      permissions: RENT_PERMISSIONS.filter(
        (p) =>
          !p.startsWith('roles:') &&
          ![
            'channels:manage',
            'remittances:approve',
            'remittances:pay',
            'payments:refund',
            'users:delete',
            'settings:update',
            'sms:manage',
          ].includes(p),
      ),
    },
    ACCOUNTANT: {
      name: 'Accountant',
      description: 'Invoices, payments, reconciliation, expenses and remittances.',
      permissions: [
        ...RENT_VIEW_ALL.filter((p) => !['users:view', 'roles:view', 'audit:view'].includes(p)),
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
  };
}

/** Default permissions for the four roles in landlord/agency organisations. */
export const SYSTEM_ROLE_DEFAULTS = systemRoleDefaults('LANDLORD');
