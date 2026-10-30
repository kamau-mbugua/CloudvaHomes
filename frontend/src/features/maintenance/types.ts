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
  canResolve: boolean;
  canCancel: boolean;
  canConvertToExpense: boolean;
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
