export interface MaintenanceRequestItem {
  id: string;
  number: string;
  code: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  title: string;
  description: string;
  photoUploadIds: string[];
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  property: { id: string; code: string; name: string };
  unit: { id: string; number: string; floor: number };
  tenant: {
    id: string;
    code: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  expense: {
    id: string;
    name: string;
    amount: number;
    incurredOn: string;
  } | null;
  /** Phase 18: who's doing it, since when, and whether it's past its response time. */
  vendor?: { id: string; name: string; phone: string } | null;
  assignedAt?: string | null;
  /** Phase 19: vendor repair link & vendor completion report. */
  hasVendorLink?: boolean;
  vendorNote?: string | null;
  vendorPhotoUploadIds?: string[];
  vendorCompletedAt?: string | null;
  overdue?: boolean;
  canResolve: boolean;
  canCancel: boolean;
  canConvertToExpense: boolean;
}

export interface PublicVendorJob {
  number: string;
  title: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  property: { name: string; location: string | null };
  unit: { number: string; floor: number };
  organization: { name: string; phone: string };
  vendor: { name: string } | null;
  photoUploadIds: string[];
  vendorNote: string | null;
  vendorPhotoUploadIds: string[];
  vendorCompletedAt: string | null;
}

export const MAINTENANCE_CATEGORIES: Record<string, string> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  APPLIANCE: 'Appliance',
  CARPENTRY: 'Carpentry',
  PAINTING: 'Painting',
  PEST_CONTROL: 'Pest control',
  STRUCTURAL: 'Structural',
  OTHER: 'Other',
};

export const MAINTENANCE_PRIORITIES: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const MAINTENANCE_STATUSES: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
};

/** Phase 18 (first step): someone maintenance jobs can be sent to. */
export interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  trades: string[];
  notes: string | null;
  active: boolean;
  openJobs?: number;
  createdAt: string;
}
