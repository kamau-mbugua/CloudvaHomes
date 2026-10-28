import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { PHOTO_TYPES, RECEIPT_TYPES, checkUploadFile, formatBytes, isImageType } from '../../lib/files';
import { uploadErrorMessage, uploadFile, useAuthedBlobUrl, useLocalFileUrl } from './api';
import type { AttachmentDraft, UploadPurpose } from './api';

/**
 * Attachment pieces: a receipt field (drag-drop, pick or photograph, uploaded straight
 * away), a preview of a private file, and a PDF icon.
 */


export function PdfIcon({ size = 40 }: { size?: number }) {
  return (
    <svg className="up__pdficon" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M9 3h15l9 9v23a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="var(--card)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M24 3v9h9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text x="20" y="29" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">PDF</text>
    </svg>
  );
}

/**
 * A private file from the API (`/expenses/:id/receipt`, `/meter-readings/:id/photo`): an
 * image is shown, a PDF gets an icon and an "Open" link to the fetched copy.
 */
export function PrivateFilePreview({
  path,
  alt,
  className = 'up__preview',
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const file = useAuthedBlobUrl(path);
  if (file.status === 'error') {
    return <p className="ad__error" role="alert">{uploadErrorMessage(file.error, () => 'The file could not be loaded. Try again.')}</p>;
  }
  if (file.status !== 'ready') return <div className={`${className} up__loading`} role="status">Loading…</div>;
  if (isImageType(file.type)) return <img className={className} src={file.url} alt={alt} />;
  return (
    <div className="up__pdf">
      <PdfIcon />
      <a className="nx-btn nx-btn--sm" href={file.url} target="_blank" rel="noopener noreferrer">Open PDF</a>
    </div>
  );
}

/**
 * The receipt on an expense form. A picked file is checked here, then uploaded at once so
 * saving the form only passes its id; `onBusy` lets the form wait for the upload.
 */
export function AttachmentField({
  id,
  label,
  purpose,
  saved,
  value,
  onChange,
  onBusy,
  disabled = false,
  error,
  describeError,
}: {
  id: string;
  label: string;
  purpose: UploadPurpose;
  /** The attachment already on the record, if any. */
  saved: { path: string; contentType: string; size: number } | null;
  value: AttachmentDraft;
  onChange: (next: AttachmentDraft) => void;
  onBusy: (busy: boolean) => void;
  disabled?: boolean;
  error?: string;
  describeError: (error: unknown) => string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const allowed = purpose === 'METER_PHOTO' ? PHOTO_TYPES : RECEIPT_TYPES;
  const localUrl = useLocalFileUrl(value.kind === 'new' ? value.file : null);

  const take = async (file: File | undefined) => {
    if (!file || disabled || uploading) return;
    const check = checkUploadFile(file, allowed);
    if (!check.ok) {
      setProblem(check.error);
      return;
    }
    setProblem(null);
    setUploading(true);
    onBusy(true);
    try {
      const upload = await uploadFile(purpose, file);
      onChange({ kind: 'new', upload, file });
    } catch (caught) {
      setProblem(uploadErrorMessage(caught, describeError));
    } finally {
      setUploading(false);
      onBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void take(event.dataTransfer.files?.[0]);
  };

  const shown = value.kind === 'new' ? 'new' : value.kind === 'keep' && saved ? 'saved' : 'none';
  const message = problem ?? error;

  const inputs = (
    <>
      <input ref={picker} id={id} type="file" className="nx-sr" accept={allowed.join(',')} tabIndex={-1}
        onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={camera} type="file" className="nx-sr" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );

  const pickButtons = (replace: boolean) => (
    <>
      <button type="button" className="nx-btn nx-btn--sm" disabled={disabled || uploading} onClick={() => picker.current?.click()}>
        {replace ? 'Replace' : 'Choose a file'}
      </button>
      <button type="button" className="nx-btn nx-btn--sm up__camera" disabled={disabled || uploading} onClick={() => camera.current?.click()}>
        Take a photo
      </button>
    </>
  );

  return (
    <div className={`fld fm__wide ${message ? 'is-bad' : ''}`}>
      <label htmlFor={id}>{label}<span className="nx-muted"> (optional)</span></label>
      {inputs}
      {shown === 'none' ? (
        <div
          className={`up__drop ${dragging ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="up__droptext">
            {uploading ? 'Uploading…' : purpose === 'METER_PHOTO' ? 'Drop a photo here' : 'Drop a photo or PDF of the receipt here'}
          </p>
          <div className="up__dropbtns">{pickButtons(false)}</div>
          <span className="hint">JPEG, PNG, WebP{purpose === 'METER_PHOTO' ? '' : ' or PDF'}, up to 10 MB.</span>
        </div>
      ) : (
        <div className="up__attached">
          {shown === 'new' && value.kind === 'new' ? (
            isImageType(value.upload.contentType || value.file.type)
              ? (localUrl ? <img className="up__preview" src={localUrl} alt={`Receipt: ${value.file.name}`} /> : null)
              : <div className="up__pdf"><PdfIcon /></div>
          ) : saved ? (
            <PrivateFilePreview path={saved.path} alt="The receipt on file" />
          ) : null}
          <div className="up__meta">
            <span className="up__name">
              {value.kind === 'new' ? value.file.name : isImageType(saved?.contentType) ? 'Photo on file' : 'PDF on file'}
            </span>
            <span className="ad__sub num">
              {formatBytes(value.kind === 'new' ? value.upload.size || value.file.size : saved?.size ?? 0)}
              {uploading ? ' · Uploading…' : value.kind === 'new' ? ' · Attached when you save' : ''}
            </span>
            <div className="up__dropbtns">
              {pickButtons(true)}
              <button type="button" className="nx-btn nx-btn--sm nx-btn--danger" disabled={disabled || uploading}
                onClick={() => { setProblem(null); onChange(saved ? { kind: 'remove' } : { kind: 'keep' }); }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {value.kind === 'remove' ? (
        <span className="hint">
          The receipt on file will be removed when you save.{' '}
          <button type="button" className="up__linkbtn" onClick={() => onChange({ kind: 'keep' })}>Keep it</button>
        </span>
      ) : null}
      {message ? <span className="fld__err" role="alert">{message}</span> : null}
    </div>
  );
}
