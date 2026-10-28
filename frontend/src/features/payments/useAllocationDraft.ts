import { useState } from 'react';
import { minorToInput } from '../../lib/money';
import { allocationDraftTotal, checkAllocations, creditLeft, planAllocations } from './rules';
import type { AllocationLine } from './rules';
import type { OpenInvoice } from './types';

/**
 * The state behind <AllocationEditor>: the suggested split of a payment over open
 * invoices (oldest due first, or `preferId` first), hand edits, and checking them.
 * "Record payment" and the reconciliation "Assign to tenant" sheet both use it.
 */

export interface AllocationDraft {
  auto: boolean;
  /** Typed amounts by invoice id, as shown (the suggestion until one is edited). */
  shown: Record<string, string>;
  /** Invoices in the order the money goes to them. */
  ordered: OpenInvoice[];
  allocated: number;
  credit: number;
  edited: boolean;
  rowErrors: Record<string, string>;
  setRowErrors: (errors: Record<string, string>) => void;
  setAuto: (auto: boolean) => void;
  setRow: (invoiceId: string, value: string) => void;
  resuggest: () => void;
  /** Back to the automatic suggestion (a new tenant, or "record another"). */
  reset: (auto?: boolean) => void;
  /**
   * The allocations to send for a payment of `amount` cents. `undefined` = automatic (send
   * none). On a mistake the row errors are set and `general` explains the total.
   */
  check: (amount: number) => { ok: true; allocations: AllocationLine[] | undefined } | { ok: false; general: string | null };
}

export function useAllocationDraft(
  invoices: OpenInvoice[],
  amountMinor: number,
  { preferId, initialAuto = true, onChange }: { preferId?: string; initialAuto?: boolean; onChange?: () => void } = {},
): AllocationDraft {
  const [auto, setAutoState] = useState(initialAuto);
  /** Typed allocations, once the suggestion has been edited by hand. */
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const plan = planAllocations(amountMinor, invoices, preferId);
  const planById = Object.fromEntries(plan.map((p) => [p.invoiceId, p.amount]));
  const suggested = Object.fromEntries(invoices.map((i) => [i.id, planById[i.id] ? minorToInput(planById[i.id]) : '']));
  const shown = !auto && drafts ? drafts : suggested;
  const allocated = auto ? plan.reduce((s, p) => s + p.amount, 0) : allocationDraftTotal(shown);
  const ordered = plan.map((p) => invoices.find((i) => i.id === p.invoiceId)).filter((i): i is OpenInvoice => Boolean(i));

  return {
    auto,
    shown,
    ordered,
    allocated,
    credit: creditLeft(amountMinor, allocated),
    edited: !auto && drafts !== null,
    rowErrors,
    setRowErrors,
    setAuto: (next) => { setAutoState(next); setDrafts(null); setRowErrors({}); onChange?.(); },
    setRow: (invoiceId, value) => { setDrafts({ ...shown, [invoiceId]: value }); onChange?.(); },
    resuggest: () => { setDrafts(null); setRowErrors({}); onChange?.(); },
    reset: (nextAuto = true) => { setAutoState(nextAuto); setDrafts(null); setRowErrors({}); },
    check: (amount) => {
      if (auto) { setRowErrors({}); return { ok: true, allocations: undefined }; }
      // In the order shown, so `allocations[i]` in a 422 is the i-th row on screen.
      const checked = checkAllocations(shown, ordered, amount);
      if (checked.ok) { setRowErrors({}); return { ok: true, allocations: checked.allocations }; }
      setRowErrors(checked.errors);
      return { ok: false, general: checked.general ?? null };
    },
  };
}
