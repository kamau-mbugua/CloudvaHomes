import type { ReactNode } from 'react';
import {
  BellIcon, CashIcon, FolderIcon, HomeIcon, InvoiceIcon, PersonIcon, ReceiptIcon, WrenchIcon,
} from '../../app/icons';

/** The tenant menu, in the order the design fixes. */
export const TENANT_MENU: { to: string; label: string; end?: boolean; icon: ReactNode }[] = [
  { to: '/tenant', label: 'Dashboard', end: true, icon: <HomeIcon /> },
  { to: '/tenant/invoices', label: 'Invoices', icon: <InvoiceIcon /> },
  { to: '/tenant/statement', label: 'Statement', icon: <ReceiptIcon /> },
  { to: '/tenant/payments', label: 'Payments', icon: <CashIcon /> },
  { to: '/tenant/requests', label: 'Maintenance', icon: <WrenchIcon /> },
  { to: '/tenant/documents', label: 'Documents', icon: <FolderIcon /> },
  { to: '/tenant/notices', label: 'Notices', icon: <BellIcon /> },
  { to: '/tenant/profile', label: 'My profile', icon: <PersonIcon /> },
];
