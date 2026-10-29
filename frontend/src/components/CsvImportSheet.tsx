import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { downloadCsv, parseCsv, serializeCsv } from '../lib/csv';
import type { ParsedCsvRow } from '../lib/csv';
import { useToast } from '../lib/useToast';
import { Sheet } from './Sheet';

export interface CsvColumnSpec {
  name: string;
  required?: boolean;
  description: string;
  example?: string;
}

export interface CsvPreviewColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export type CsvValidatedRow<T> =
  | {
      ok: true;
      rowNumber: number;
      data: T;
      cells: Record<string, string>;
    }
  | {
      ok: false;
      rowNumber: number;
      error: string;
      cells: Record<string, string>;
    };

export interface CsvRowOutcome {
  status: 'imported' | 'skipped' | 'error';
  message?: string;
}

export interface CsvImportResult {
  importedCount: number;
  summaryMessage: string;
  rowResults?: Record<number, CsvRowOutcome>;
}

interface CsvImportSheetProps<T> {
  title: string;
  subtitle: string;
  sampleFilename: string;
  sampleHeaders: string[];
  sampleRows: (string | number | boolean | null | undefined)[][];
  columns: CsvColumnSpec[];
  previewColumns: CsvPreviewColumn[];
  validateRow: (
    row: ParsedCsvRow,
    index: number,
    allRows: ParsedCsvRow[],
  ) =>
    | { ok: true; data: T; cells: Record<string, string> }
    | { ok: false; error: string; cells: Record<string, string> };
  executeImport: (
    items: { rowNumber: number; data: T }[],
    onProgress: (done: number, total: number) => void,
  ) => Promise<CsvImportResult>;
  extraControls?: ReactNode;
  loadingContext?: boolean;
  onClose: () => void;
}

type ImportTab = 'upload' | 'preview' | 'guide';

export function CsvImportSheet<T>({
  title,
  subtitle,
  sampleFilename,
  sampleHeaders,
  sampleRows,
  columns,
  previewColumns,
  validateRow,
  executeImport,
  extraControls,
  loadingContext = false,
  onClose,
}: CsvImportSheetProps<T>) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<ImportTab>('upload');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [rowOutcomes, setRowOutcomes] = useState<Record<number, CsvRowOutcome>>({});
  const [summaryBanner, setSummaryBanner] = useState<string | null>(null);

  const parsed = useMemo(() => parseCsv(csvText), [csvText]);

  const validatedRows: CsvValidatedRow<T>[] = useMemo(() => {
    if (loadingContext) return [];
    return parsed.rows.map((row, idx) => {
      const checked = validateRow(row, idx, parsed.rows);
      if (checked.ok) {
        return {
          ok: true,
          rowNumber: row.rowNumber,
          data: checked.data,
          cells: checked.cells,
        };
      }
      return {
        ok: false,
        rowNumber: row.rowNumber,
        error: checked.error,
        cells: checked.cells,
      };
    });
  }, [parsed.rows, validateRow, loadingContext]);

  const validPendingItems = useMemo(
    () =>
      validatedRows.filter(
        (r): r is Extract<CsvValidatedRow<T>, { ok: true }> =>
          r.ok && rowOutcomes[r.rowNumber]?.status !== 'imported',
      ),
    [validatedRows, rowOutcomes],
  );

  const invalidCount = useMemo(
    () =>
      validatedRows.filter(
        (r) => !r.ok || rowOutcomes[r.rowNumber]?.status === 'error',
      ).length,
    [validatedRows, rowOutcomes],
  );

  const importedCount = useMemo(
    () =>
      Object.values(rowOutcomes).filter((o) => o.status === 'imported').length,
    [rowOutcomes],
  );

  const loadFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setRowOutcomes({});
    setGeneralError(null);
    setSummaryBanner(null);
    setTab('preview');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const handleLoadSample = () => {
    const text = serializeCsv(sampleHeaders, sampleRows);
    setFileName(`${sampleFilename} (sample)`);
    setCsvText(text);
    setRowOutcomes({});
    setGeneralError(null);
    setSummaryBanner(null);
    setTab('preview');
  };

  const handleRunImport = async () => {
    if (validPendingItems.length === 0 || busy) return;
    setBusy(true);
    setGeneralError(null);
    setSummaryBanner(null);
    setProgress({ done: 0, total: validPendingItems.length });
    try {
      const result = await executeImport(
        validPendingItems.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
        (done, total) => setProgress({ done, total }),
      );
      const nextOutcomes: Record<number, CsvRowOutcome> = { ...rowOutcomes, ...(result.rowResults ?? {}) };
      setRowOutcomes(nextOutcomes);
      setSummaryBanner(result.summaryMessage);

      const hasErrors = Object.values(nextOutcomes).some((o) => o.status === 'error');
      if (result.importedCount > 0) {
        toast.saved(result.summaryMessage);
      }
      if (!hasErrors && invalidCount === 0 && result.importedCount > 0) {
        onClose();
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Something went wrong while importing.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Sheet
      title={title}
      wide
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={busy}>
            {importedCount > 0 && validPendingItems.length === 0 ? 'Done' : 'Cancel'}
          </button>
          {tab === 'upload' && parsed.rows.length > 0 ? (
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={() => setTab('preview')}
              disabled={busy}
            >
              Preview {parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'}
            </button>
          ) : (
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={() => void handleRunImport()}
              disabled={busy || loadingContext || validPendingItems.length === 0}
            >
              {busy
                ? progress
                  ? `Importing ${progress.done} of ${progress.total}…`
                  : 'Importing…'
                : validPendingItems.length > 0
                  ? `Import ${validPendingItems.length} ${validPendingItems.length === 1 ? 'row' : 'rows'}`
                  : 'Import CSV'}
            </button>
          )}
        </>
      }
    >
      <div className="csv-import">
        <p className="ad__muted">{subtitle}</p>

        <div className="pf__tabsrow">
          <div className="pf__tabs" role="tablist" aria-label="CSV import steps">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'upload'}
              className="pf__tab"
              onClick={() => setTab('upload')}
            >
              1. File &amp; paste
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'preview'}
              className="pf__tab"
              onClick={() => setTab('preview')}
            >
              2. Preview &amp; validate ({parsed.rows.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'guide'}
              className="pf__tab"
              onClick={() => setTab('guide')}
            >
              Column guide ({columns.length})
            </button>
          </div>
        </div>

        {extraControls}

        {tab === 'upload' ? (
          <>
            <div className="csv-import__bar">
              <div>
                <strong>Need a starting template?</strong>
                <div className="hint">Download a ready-made CSV for Excel or Google Sheets, or load sample rows to see the format.</div>
              </div>
              <div className="csv-import__bar-actions">
                <button
                  type="button"
                  className="nx-btn nx-btn--sm"
                  onClick={() => downloadCsv(sampleFilename, sampleHeaders, sampleRows)}
                >
                  Download template CSV
                </button>
                <button
                  type="button"
                  className="nx-btn nx-btn--sm"
                  onClick={handleLoadSample}
                >
                  Load sample rows
                </button>
              </div>
            </div>

            <label
              className={`csv-import__drop ${dragging ? 'is-drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="nx-sr"
                onChange={handleFileChange}
                disabled={busy}
              />
              <strong>{fileName ? `Selected: ${fileName}` : 'Choose a CSV file or drag and drop it here'}</strong>
              <span className="hint">Supports comma-, semicolon- or tab-separated files exported from Excel or Google Sheets.</span>
            </label>

            <div className="fld">
              <label className="fld__label" htmlFor="csv-paste-box">
                Or paste CSV / spreadsheet rows directly
              </label>
              <textarea
                id="csv-paste-box"
                className="csv-import__textarea"
                rows={8}
                value={csvText}
                placeholder={serializeCsv(sampleHeaders, sampleRows.slice(0, 2)).trim()}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setRowOutcomes({});
                  setSummaryBanner(null);
                }}
                disabled={busy}
              />
              <span className="hint">
                Include the header row on line 1. {parsed.rows.length > 0 ? `${parsed.rows.length} data ${parsed.rows.length === 1 ? 'row' : 'rows'} detected.` : ''}
              </span>
            </div>
          </>
        ) : null}

        {tab === 'preview' ? (
          <>
            <div className="csv-import__bar">
              <div className="csv-import__stats">
                <span className="ad__badge ad__badge--info">
                  {parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'}
                </span>
                <span className="ad__badge ad__badge--ok">
                  {validPendingItems.length} ready
                </span>
                {importedCount > 0 ? (
                  <span className="ad__badge ad__badge--ok">
                    {importedCount} imported
                  </span>
                ) : null}
                {invalidCount > 0 ? (
                  <span className="ad__badge ad__badge--warn">
                    {invalidCount} {invalidCount === 1 ? 'needs attention' : 'need attention'}
                  </span>
                ) : null}
              </div>
              <div className="csv-import__bar-actions">
                <button type="button" className="nx-btn nx-btn--sm" onClick={() => setTab('upload')} disabled={busy}>
                  Edit CSV / change file
                </button>
              </div>
            </div>

            {summaryBanner ? (
              <p className="ad__ok" role="status">{summaryBanner}</p>
            ) : null}
            {generalError ? (
              <p className="nx-sheet__error" role="alert">{generalError}</p>
            ) : null}

            {loadingContext ? (
              <p className="ad__muted" role="status">Loading existing records for validation…</p>
            ) : validatedRows.length === 0 ? (
              <div className="ad__tablewrap">
                <div className="es">
                  <p className="es__title">No rows to preview yet</p>
                  <p className="es__detail">Choose a CSV file or paste spreadsheet rows on the first tab.</p>
                  <div className="es__actions">
                    <button type="button" className="nx-btn nx-btn--sm" onClick={() => setTab('upload')}>
                      Choose file
                    </button>
                    <button type="button" className="nx-btn nx-btn--sm" onClick={handleLoadSample}>
                      Load sample rows
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ad__tablewrap">
                <table className="ad__table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      {previewColumns.map((col) => (
                        <th key={col.key} className={col.numeric ? 'num' : undefined}>{col.label}</th>
                      ))}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRows.map((row) => {
                      const outcome = rowOutcomes[row.rowNumber];
                      return (
                        <tr key={row.rowNumber}>
                          <td className="num">{row.rowNumber}</td>
                          {previewColumns.map((col) => (
                            <td key={col.key} className={col.numeric ? 'num' : undefined}>
                              {row.cells[col.key] || <span className="ad__muted">—</span>}
                            </td>
                          ))}
                          <td>
                            {outcome?.status === 'imported' ? (
                              <span className="ad__badge ad__badge--ok">{outcome.message || 'Imported'}</span>
                            ) : outcome?.status === 'skipped' ? (
                              <span className="ad__badge ad__badge--off">{outcome.message || 'Skipped'}</span>
                            ) : outcome?.status === 'error' ? (
                              <span className="fld__err">{outcome.message || 'Failed'}</span>
                            ) : row.ok ? (
                              <span className="ad__badge ad__badge--ok">Ready</span>
                            ) : (
                              <span className="fld__err">{row.error}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {tab === 'guide' ? (
          <div className="ad__tablewrap">
            <table className="ad__table">
              <thead>
                <tr>
                  <th>Column header</th>
                  <th>Required</th>
                  <th>Description</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <tr key={col.name}>
                    <td><strong className="num">{col.name}</strong></td>
                    <td>
                      {col.required ? (
                        <span className="ad__badge ad__badge--info">Required</span>
                      ) : (
                        <span className="ad__muted">Optional</span>
                      )}
                    </td>
                    <td>{col.description}</td>
                    <td className="num">{col.example || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
