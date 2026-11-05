import { useState } from 'react';
import { copyText } from '../../lib/clipboard';
import { useToast } from '../../lib/useToast';
import { howToPaySteps, payNumber, shortcodeLabel } from './rules';
import type { HowToPay, TenantOverview } from './types';

/** How to pay a landlord by hand (paybill, till, bank) and how to reach them. */
export function HowToPayCard({ ways, orgName }: { ways: HowToPay[]; orgName: string }) {
  if (ways.length === 0) {
    return (
      <section className="ag__card">
        <h3>How to pay</h3>
        <p className="ad__muted">Ask {orgName} how to pay.</p>
      </section>
    );
  }
  return (
    <section className="ag__card">
      <h3>How to pay</h3>
      {ways.map((way, i) => {
        const number = payNumber(way);
        return (
          <div key={`${way.kind}-${number ?? i}`} className="tp__way">
            <span className="tp__wayname">{way.name}{way.kind === 'BANK_ACCOUNT' && way.bankName ? ` · ${way.bankName}` : ''}</span>
            {number ? <CopyRow label={shortcodeLabel(way.kind)} value={number} /> : null}
            {way.accountRef ? <CopyRow label={way.kind === 'BANK_ACCOUNT' ? 'Reference' : 'Account number'} value={way.accountRef} /> : null}
            {way.accountName ? <span className="ad__sub">In the name of {way.accountName}</span> : null}
            <ol className="tp__steps">
              {howToPaySteps(way).map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

/** A number to type into M-Pesa, with a large copy button. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.failed('Couldn’t copy. Press and hold the number to copy it.');
    }
  };
  return (
    <div className="tp__copy">
      <span className="tp__copylabel">{label}</span>
      <strong className="tp__copyvalue num">{value}</strong>
      <button type="button" className="nx-btn tp__copybtn" onClick={copy} aria-label={`Copy ${label.toLowerCase()} ${value}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function ContactCard({ org }: { org: TenantOverview['organization'] }) {
  return (
    <section className="ag__card">
      <h3>Contact {org.name}</h3>
      {org.phone || org.email ? (
        <div className="tp__contact">
          {org.phone ? <a className="nx-btn" href={`tel:${org.phone}`}>Call{'\u00a0'}<span className="num">{org.phone}</span></a> : null}
          {org.email ? <a className="nx-btn" href={`mailto:${org.email}`}>E-mail {org.email}</a> : null}
        </div>
      ) : <p className="ad__muted">No contact details on file.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- invoices
