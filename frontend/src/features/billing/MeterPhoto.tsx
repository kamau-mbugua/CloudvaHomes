import { useEffect, useRef, useState } from 'react';
import { PHOTO_TYPES, checkUploadFile } from '../../lib/files';
import { Sheet } from '../../components/Sheet';
import { uploadErrorMessage, uploadFile, useAuthedBlobUrl, useLocalFileUrl } from '../uploads/api';
import type { Upload } from '../uploads/api';
import { billingErrorMessage } from './api';

/**
 * The photo cell on a meter-readings row. "Photo" opens the phone's camera (`capture`)
 * or a file picker on a computer; the picture is uploaded at once and attached when the
 * row is saved. A saved photo shows as a thumbnail (fetched only once it scrolls into
 * view, so a long sheet doesn't pull every picture) and opens full size.
 */

export interface PendingPhoto {
  upload: Upload;
  file: File;
}

/** True once the element has been on screen; stays true. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  // Without IntersectionObserver (very old browsers), load straight away.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (seen || !node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return { ref, seen };
}

export function MeterPhotoCell({
  unitNumber,
  readingId,
  savedPhoto,
  pending,
  onPicked,
  canTake,
  disabled,
}: {
  unitNumber: string;
  readingId: string | null;
  savedPhoto: boolean;
  pending: PendingPhoto | null;
  onPicked: (photo: PendingPhoto) => void;
  canTake: boolean;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { ref, seen } = useSeen<HTMLDivElement>();
  const savedPath = savedPhoto && readingId ? `/meter-readings/${readingId}/photo` : null;
  const saved = useAuthedBlobUrl(seen && !pending ? savedPath : null);
  const local = useLocalFileUrl(pending?.file ?? null);
  const thumb = pending ? local : saved.status === 'ready' ? saved.url : null;
  const has = Boolean(pending || savedPath);

  const take = async (file: File | undefined) => {
    if (!file) return;
    const check = checkUploadFile(file, PHOTO_TYPES);
    if (!check.ok) {
      setProblem(check.error);
      return;
    }
    setProblem(null);
    setUploading(true);
    try {
      onPicked({ upload: await uploadFile('METER_PHOTO', file), file });
    } catch (caught) {
      setProblem(uploadErrorMessage(caught, (e) => billingErrorMessage(e)));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="up__cell" ref={ref}>
      {has ? (
        <button type="button" className="up__thumb" onClick={() => setOpen(true)} aria-label={`View the meter photo for unit ${unitNumber}`}>
          {thumb ? <img src={thumb} alt="" /> : <span className="up__thumbph" aria-hidden="true">{saved.status === 'error' ? '!' : '…'}</span>}
        </button>
      ) : null}
      {canTake ? (
        <>
          <input ref={input} type="file" className="nx-sr" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="nx-btn nx-btn--sm" disabled={disabled || uploading}
            aria-label={`${has ? 'Retake' : 'Take'} the meter photo for unit ${unitNumber}`}
            onClick={() => input.current?.click()}>
            {uploading ? 'Uploading…' : has ? 'Retake' : 'Photo'}
          </button>
        </>
      ) : !has ? <span className="nx-muted">—</span> : null}
      {pending ? <span className="ad__sub">Saved with the reading</span> : null}
      {problem ? <span className="fld__err" role="alert">{problem}</span> : null}

      {open ? (
        <Sheet title={`Meter photo — unit ${unitNumber}`} wide onClose={() => setOpen(false)}
          footer={<button type="button" className="nx-btn" onClick={() => setOpen(false)}>Close</button>}>
          {pending && local ? <img className="up__full" src={local} alt={`New meter photo for unit ${unitNumber}`} />
            : <FullPhoto path={savedPath} unitNumber={unitNumber} />}
        </Sheet>
      ) : null}
    </div>
  );
}

function FullPhoto({ path, unitNumber }: { path: string | null; unitNumber: string }) {
  const photo = useAuthedBlobUrl(path);
  if (photo.status === 'error') return <p className="ad__error" role="alert">{uploadErrorMessage(photo.error, (e) => billingErrorMessage(e))}</p>;
  if (photo.status !== 'ready') return <p className="ad__muted" role="status">Loading…</p>;
  return <img className="up__full" src={photo.url} alt={`Meter photo for unit ${unitNumber}`} />;
}
