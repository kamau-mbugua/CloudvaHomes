import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { csvFilename, saveBlob } from '../../lib/files';
import { expensesErrorMessage, reportKeys } from '../expenses/api';
import { unwrap } from '../payments/rules';
import type { ArrearsReport, Dashboard, OccupancyReport, PnlReport } from './types';

/**
 * Reads and CSV downloads for the dashboard and the reports. Every key starts with
 * `reportKeys`, which expense changes invalidate.
 */

type Params = Record<string, string | undefined>;

export function useDashboard(period: string, enabled = true) {
  return useQuery({
    queryKey: [...reportKeys, 'dashboard', period],
    queryFn: () => api.get<unknown>('/reports/dashboard', { period }).then((body) => unwrap<Dashboard>(body)),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

const PATHS = {
  pnl: '/reports/property-pnl',
  arrears: '/reports/arrears',
  occupancy: '/reports/occupancy',
} as const;

interface Shapes { pnl: PnlReport; arrears: ArrearsReport; occupancy: OccupancyReport }

export function useReport<K extends keyof Shapes>(kind: K, params: Params, enabled = true) {
  return useQuery({
    queryKey: [...reportKeys, kind, params],
    queryFn: () => api.get<unknown>(PATHS[kind], params).then((body) => unwrap<Shapes[K]>(body)),
    enabled,
    placeholderData: keepPreviousData,
  });
}

const NAMES: Record<keyof Shapes, string> = {
  pnl: 'profit-and-loss',
  arrears: 'arrears',
  occupancy: 'occupancy',
};

/**
 * The same report as CSV (fetched with the session token), saved as e.g.
 * `profit-and-loss-kc-2026-01-to-2026-10.csv` or `arrears-2026-10-27.csv`.
 */
export async function downloadReportCsv(
  kind: keyof Shapes,
  params: Params,
  naming: { from?: string; to?: string; asOf?: string; extra?: string },
): Promise<void> {
  const blob = await api.blob(PATHS[kind], { ...params, format: 'csv' });
  saveBlob(blob, csvFilename(NAMES[kind], naming), 'text/csv');
}

export const reportsErrorMessage = (error: unknown) => expensesErrorMessage(error);
