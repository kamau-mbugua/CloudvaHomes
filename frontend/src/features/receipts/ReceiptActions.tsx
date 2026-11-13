import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { errorMessage } from '../../lib/api/client';
import { useToast } from '../../lib/useToast';
import {
  downloadReceipt,
  fetchReceiptPdf,
  sendPlan,
  sendReceipt,
  sentMessage,
  type ReceiptRef,
} from './receipts';

/**
 * Preview, Send and Download for one receipt: the same three actions wherever a receipt is
 * listed (Money → Receipts, a booking's payments, a rent payment).
 */
export function ReceiptActions({
  receipt,
  canSend,
  size = 'sm',
}: {
  receipt: ReceiptRef;
  canSend: boolean;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState<'preview' | 'send' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  const btn = size === 'sm' ? 'nx-btn nx-btn--sm' : 'nx-btn';

  const download = async () => {
    setDownloading(true);
    try {
      await downloadReceipt(receipt);
    } catch (err) {
      toast.failed(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className="rc__actions">
      <button type="button" className={btn} onClick={() => setOpen('preview')}>
        Preview
      </button>
      {canSend && (
        <button type="button" className={btn} onClick={() => setOpen('send')}>
          Send
        </button>
      )}
      <button type="button" className={btn} onClick={download} disabled={downloading}>
        {downloading ? 'Preparing…' : 'Download'}
      </button>
      {open === 'preview' && (
        <ReceiptPreviewSheet
          receipt={receipt}
          canSend={canSend}
          onSend={() => setOpen('send')}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'send' && <SendReceiptSheet receipt={receipt} onClose={() => setOpen(null)} />}
    </span>
  );
}

/** The receipt PDF shown in place, with Download and Send beside it. */
export function ReceiptPreviewSheet({
  receipt,
  canSend,
  onSend,
  onClose,
}: {
  receipt: ReceiptRef;
  canSend: boolean;
  onSend: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let made: string | null = null;
    fetchReceiptPdf(receipt)
      .then((blob) => {
        if (!live) return;
        made = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: 'application/pdf' }),
        );
        setUrl(made);
      })
      .catch((err: unknown) => live && setError(errorMessage(err)));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [receipt]);

  return (
    <Sheet
      title={`Receipt ${receipt.number}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="nx-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="nx-btn"
            onClick={() => downloadReceipt(receipt).catch((err) => toast.failed(errorMessage(err)))}
          >
            Download
          </button>
          {canSend && (
            <button type="button" className="nx-btn nx-btn--primary" onClick={onSend}>
              Send to {receipt.recipient.name.split(/\s+/)[0]}
            </button>
          )}
        </>
      }
    >
      {error ? (
        <p className="ad__error" role="alert">
          {error}
        </p>
      ) : url ? (
        <iframe className="rc__frame" src={url} title={`Receipt ${receipt.number}`} />
      ) : (
        <div className="rc__frame rc__frame--loading" role="status">
          Loading receipt…
        </div>
      )}
    </Sheet>
  );
}

/** Confirms who the receipt goes to and how, then sends it. */
export function SendReceiptSheet({
  receipt,
  onClose,
}: {
  receipt: ReceiptRef;
  onClose: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => sendReceipt(receipt),
    onSuccess: (result) => {
      const msg = sentMessage(receipt.number, result);
      if (msg.ok) {
        toast.saved(msg.text);
        onClose();
      } else {
        setError(msg.text);
      }
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Sheet
      title={`Send receipt ${receipt.number}`}
      busy={mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="nx-btn nx-btn--primary"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? 'Sending…' : 'Send receipt'}
          </button>
        </>
      }
    >
      <p>
        Send receipt <strong>{receipt.number}</strong> to{' '}
        <strong>{receipt.recipient.name}</strong>:
      </p>
      <ul className="rc__plan">
        {sendPlan(receipt.recipient).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="ad__muted">The SMS uses one unit; the link works for 90 days.</p>
      {error && (
        <p className="nx-sheet__error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
