import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatBytes } from '../../lib/files';
import { Sheet } from '../../components/Sheet';
import { keys as mpesaKeys } from '../mpesa/api';
import { AFTER_PAYMENT_KEYS, keys as paymentKeys } from '../payments/api';
import { unwrap } from '../payments/rules';
import type { PaymentChannel } from '../payments/types';
import { bankKeys, banksErrorMessage } from './api';
import { checkMapping, checkStatementFile, describeImport, draftFromMapping, mappingJson, sampleRows } from './rules';
import type { AmountMode, MappingDraft, MappingField } from './rules';
import type { DateFormat, StatementImportResult, StatementPreview } from './types';

/**
 * Import a bank statement (CSV) into a bank account channel:
 *
 * 1. choose the file → the server previews it with the mapping saved on the channel, or
 *    its best guess;
 * 2. check which column is which against the sample rows — each change previews again;
 * 3. import → what was new, matched and left for Reconciliation.
 *
 * Only credits (money paid in) are imported. Re-importing the same lines adds nothing,
 * so an overlapping statement is safe. The mapping is saved on the channel for next time.
 */
export function StatementImportSheet({ channel, onClose }: { channel: PaymentChannel; onClose: () => void }) {
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  // The person's edits to the mapping; null = as the server last suggested.
  const [edited, setEdited] = useState<MappingDraft | null>(null);
  // The last complete mapping, sent with each preview; null = let the server choose.
  const [sent, setSent] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const preview = useQuery({
    queryKey: [...bankKeys.preview, channel.id, fileVersion, sent ?? 'auto'],
    queryFn: async () => {
      const ask = (mapping: string | null) => api.upload<unknown>(`/payment-channels/${channel.id}/statement-imports/preview`, {
        file: file as File,
        ...(mapping ? { mapping } : {}),
      }).then((body) => unwrap<StatementPreview>(body));
      const first = await ask(sent);
      // The server only guessed (no counts): when the guess is complete, ask again with it.
      if (first.parsed === null && !sent) {
        const guess = checkMapping(draftFromMapping(first.mapping, first.headers), first.headers);
        if (guess.ok) return ask(mappingJson(guess.mapping));
      }
      return first;
    },
    enabled: Boolean(file),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });

  const run = useMutation({
    mutationFn: (mapping: string) => api.upload<unknown>(`/payment-channels/${channel.id}/statement-imports`, { file: file as File, mapping })
      .then((body) => unwrap<StatementImportResult>(body)),
    onSuccess: async () => {
      await Promise.all([bankKeys.imports, mpesaKeys.inbound, paymentKeys.channels, ...AFTER_PAYMENT_KEYS]
        .map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  const data = preview.data;
  const headers = data?.headers ?? [];
  const draft = edited ?? (data ? draftFromMapping(data.mapping, headers) : null);
  const checked = draft ? checkMapping(draft, headers) : null;
  const done = run.isSuccess;

  const take = (picked: File | undefined) => {
    if (!picked) return;
    const problem = checkStatementFile(picked);
    setFileError(problem);
    if (problem) return;
    setFile(picked);
    setFileVersion((v) => v + 1);
    setEdited(null);
    setSent(null);
    setShowErrors(false);
    run.reset();
  };

  const change = (next: MappingDraft) => {
    setEdited(next);
    const result = checkMapping(next, headers);
    if (result.ok) setSent(mappingJson(result.mapping));
  };

  const submit = () => {
    setShowErrors(true);
    if (!checked?.ok) return;
    run.mutate(mappingJson(checked.mapping));
  };

  const startAgain = () => {
    setFile(null);
    setEdited(null);
    setSent(null);
    setShowErrors(false);
    run.reset();
  };

  const canImport = Boolean(file && data && checked?.ok && !preview.isError && (data.parsed?.credits ?? 0) > 0);

  return (
    <Sheet
      title={`Import a statement — ${channel.name}`}
      wide
      busy={run.isPending}
      onClose={onClose}
      footer={done ? (
        <>
          <button type="button" className="nx-btn" onClick={startAgain}>Import another</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>Done</button>
        </>
      ) : (
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={run.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={submit} disabled={!canImport || run.isPending || preview.isFetching}>
            {run.isPending ? 'Importing…' : data?.parsed ? `Import ${data.parsed.credits} credit${data.parsed.credits === 1 ? '' : 's'}` : 'Import'}
          </button>
        </>
      )}
    >
      <div className="sheet-form bk__import">
        {done && run.data ? (
          <ImportResult channel={channel} result={run.data} />
        ) : (
          <>
            <div className={`fld ${fileError ? 'is-bad' : ''}`}>
              <label htmlFor="bk-file">Statement file (CSV)</label>
              <input ref={picker} id="bk-file" type="file" className="nx-sr" accept=".csv,text/csv" tabIndex={-1}
                onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="bk__file">
                <button type="button" className="nx-btn nx-btn--sm" onClick={() => picker.current?.click()} disabled={run.isPending}>
                  {file ? 'Choose another file' : 'Choose a file'}
                </button>
                {file ? <span className="ad__sub">{file.name} · {formatBytes(file.size)}</span> : null}
              </div>
              {fileError ? <span className="fld__err" role="alert">{fileError}</span>
                : <span className="hint">From your internet banking: the account statement, exported as CSV. Only money paid in is imported.</span>}
            </div>

            {file && preview.isPending ? <p className="ad__muted" role="status">Reading the file…</p> : null}
            {preview.isError ? <p className="ad__error" role="alert">{banksErrorMessage(preview.error)}</p> : null}

            {data && draft ? (
              <>
                <MappingForm headers={headers} draft={draft} onChange={change}
                  errors={showErrors && checked && !checked.ok ? checked.errors : {}} disabled={run.isPending} />
                <SampleTable headers={headers} rows={sampleRows(headers, data.sample)} draft={draft} />
                {data.parsed ? <PreviewCounts parsed={data.parsed} checking={preview.isFetching} /> : null}
              </>
            ) : null}

            {run.isError ? <p className="nx-sheet__error" role="alert">{banksErrorMessage(run.error)}</p> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DMY', label: 'Day first (28/10/2026)' },
  { value: 'YMD', label: 'Year first (2026-10-28)' },
];

function MappingForm({ headers, draft, onChange, errors, disabled }: {
  headers: string[];
  draft: MappingDraft;
  onChange: (next: MappingDraft) => void;
  errors: Partial<Record<MappingField, string>>;
  disabled: boolean;
}) {
  const set = <K extends keyof MappingDraft>(field: K, value: MappingDraft[K]) => onChange({ ...draft, [field]: value });

  const column = (field: MappingField, label: string, { optional = false, hint }: { optional?: boolean; hint?: string } = {}) => (
    <div className={`fld ${errors[field] ? 'is-bad' : ''}`}>
      <label htmlFor={`bk-${field}`}>{label}{optional ? <span className="nx-muted"> (optional)</span> : null}</label>
      <select id={`bk-${field}`} value={draft[field]} disabled={disabled} aria-invalid={Boolean(errors[field])}
        onChange={(e) => set(field, e.target.value)}>
        <option value="">{optional ? 'None' : 'Choose a column…'}</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      {errors[field] ? <span className="fld__err">{errors[field]}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );

  return (
    <fieldset className="bk__mapping" disabled={disabled}>
      <legend>Which column is which</legend>
      <div className="fm__grid sheet-grid">
        {column('date', 'Date')}
        <div className="fld">
          <label htmlFor="bk-dateFormat">Date format</label>
          <select id="bk-dateFormat" value={draft.dateFormat} onChange={(e) => set('dateFormat', e.target.value as DateFormat)}>
            {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="fld fm__wide">
          <span className="fld__label">Amount</span>
          <div className="pf__radios" role="radiogroup" aria-label="Amount">
            {([['AMOUNT', 'One amount column'], ['CREDIT', 'Separate paid-in and paid-out columns']] as [AmountMode, string][]).map(([mode, label]) => (
              <label key={mode} className="fld__check">
                <input type="radio" name="bk-amountmode" checked={draft.amountMode === mode} onChange={() => set('amountMode', mode)} />{label}
              </label>
            ))}
          </div>
        </div>
        {draft.amountMode === 'AMOUNT' ? (
          column('amount', 'Amount', { hint: 'Money paid out (negative amounts) is skipped.' })
        ) : (
          <>
            {column('credit', 'Paid in (credit)')}
            {column('debit', 'Paid out (debit)', { optional: true, hint: 'Rows with money paid out are skipped.' })}
          </>
        )}
        {column('reference', 'Narrative or reference', { hint: 'Searched for tenant codes (T00001) and invoice numbers.' })}
        {column('transactionId', 'Transaction ID', { optional: true, hint: 'The bank’s own reference for each line, if the file has one.' })}
        {column('payer', 'Payer', { optional: true })}
      </div>
    </fieldset>
  );
}

const ROLE: Partial<Record<MappingField, string>> = {
  date: 'Date', amount: 'Amount', credit: 'Paid in', debit: 'Paid out', reference: 'Narrative', transactionId: 'Transaction ID', payer: 'Payer',
};

/** The first rows of the file, each column tagged with what it is mapped to. */
function SampleTable({ headers, rows, draft }: { headers: string[]; rows: string[][]; draft: MappingDraft }) {
  const roles = new Map<string, string>();
  const fields: MappingField[] = draft.amountMode === 'AMOUNT'
    ? ['date', 'amount', 'reference', 'transactionId', 'payer']
    : ['date', 'credit', 'debit', 'reference', 'transactionId', 'payer'];
  for (const f of fields) if (draft[f]) roles.set(draft[f], ROLE[f] ?? f);
  if (rows.length === 0) return <p className="ad__muted">The file has headers but no rows to show.</p>;

  return (
    <section aria-labelledby="bk-sample">
      <h3 id="bk-sample" className="bk__h">First rows of the file</h3>
      <div className="ad__tablewrap bk__sample">
        <table className="ad__table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>
                  {h}
                  {roles.get(h) ? <span className="ad__badge ad__badge--info bk__role">{roles.get(h)}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={headers[j] ?? j} className={roles.has(headers[j]) ? 'bk__mapped' : undefined}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SHOWN_ERRORS = 20;

function PreviewCounts({ parsed, checking }: { parsed: NonNullable<StatementPreview['parsed']>; checking: boolean }) {
  const { credits, skipped, errors } = parsed;
  return (
    <section className="bk__counts" aria-live="polite" aria-labelledby="bk-counts">
      <h3 id="bk-counts" className="bk__h">With this mapping {checking ? <span className="ad__sub">Checking…</span> : null}</h3>
      <ul className="bk__tally">
        <li><strong className="num">{credits}</strong> credit{credits === 1 ? '' : 's'} to import</li>
        <li><strong className="num">{skipped}</strong> row{skipped === 1 ? '' : 's'} skipped (money paid out, blanks)</li>
        <li className={errors.length ? 'bk__bad' : undefined}><strong className="num">{errors.length}</strong> row{errors.length === 1 ? '' : 's'} Hodi can’t read</li>
      </ul>
      {errors.length > 0 ? (
        <>
          <ul className="bk__errors">
            {errors.slice(0, SHOWN_ERRORS).map((e) => <li key={`${e.row}-${e.message}`}><span className="num">Row {e.row}</span>: {e.message}</li>)}
          </ul>
          {errors.length > SHOWN_ERRORS ? <p className="hint">And {errors.length - SHOWN_ERRORS} more.</p> : null}
          <p className="hint">Rows Hodi can’t read are left out. Check the date format and amount columns, or fix them in the file.</p>
        </>
      ) : null}
      {credits === 0 && errors.length === 0 ? <p className="hint">There’s nothing to import with this mapping. Check the amount columns.</p> : null}
    </section>
  );
}

function ImportResult({ channel, result }: { channel: PaymentChannel; result: StatementImportResult }) {
  const { lines, unmatched } = describeImport(result);
  return (
    <section className="bk__result" aria-live="polite">
      <p className="bk__resulthead"><span className="ad__badge ad__badge--ok">Imported</span></p>
      <ul className="bk__tally">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
      {unmatched > 0 ? (
        <p>
          <Link className="nx-btn nx-btn--sm nx-btn--primary" to={`/app/reconciliation?channelId=${encodeURIComponent(channel.id)}`}>
            Match the other {unmatched} on Reconciliation
          </Link>
        </p>
      ) : null}
      {result.matched > 0 ? <p className="hint">Matched credits are recorded as payments against those tenants.</p> : null}
    </section>
  );
}
