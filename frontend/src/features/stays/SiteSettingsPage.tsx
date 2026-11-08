import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { Link, useSearchParams } from 'react-router-dom';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { useAuthedBlobUrl } from '../uploads/api';
import {
  fromApiRules,
  guestPaymentWarning,
  legalPayload,
  staysErrorMessage,
  staysKeys,
  toApiRules,
  validateStayRules,
} from './api';
import { resizeImage } from './resizeImage';
import { RulesFields } from './RulesFields';
import { LegalFields, type LegalKey, ThemeFields } from './SiteLookAndLegal';
import type { HostSite, SlugCheckResult, StayRules } from './types';

const SITE_TABS = [
  { key: 'address', label: 'Web address' },
  { key: 'business', label: 'Business & contact' },
  { key: 'rules', label: 'Booking rules' },
  { key: 'look', label: 'Look' },
  { key: 'legal', label: 'Legal pages' },
] as const;
type SiteTab = (typeof SITE_TABS)[number]['key'];

function SiteSettingsForm({ site }: { site: HostSite }) {
  // All tabs stay mounted (hidden), so edits on every tab are kept and saved together.
  const [params, setParams] = useSearchParams();
  const tab: SiteTab = SITE_TABS.some((t) => t.key === params.get('tab'))
    ? (params.get('tab') as SiteTab)
    : 'address';
  const setTab = (next: SiteTab) => setParams(next === 'address' ? {} : { tab: next }, { replace: true });
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('site:update');
  const canManageChannels = useCan('channels:view');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [slug, setSlug] = useState(site.slug ?? '');
  const [published, setPublished] = useState(site.published);
  const [businessName, setBusinessName] = useState(site.businessName);
  const [about, setAbout] = useState(site.about ?? '');
  const [contactPhone, setContactPhone] = useState(site.contactPhone ?? '');
  const [whatsappPhone, setWhatsappPhone] = useState(site.whatsappPhone ?? '');
  const [checkInTime, setCheckInTime] = useState(site.checkInTime);
  const [checkOutTime, setCheckOutTime] = useState(site.checkOutTime);
  const [houseRules, setHouseRules] = useState(site.houseRules ?? '');
  const [rules, setRules] = useState<StayRules>(() => fromApiRules(site.rules));
  const [theme, setTheme] = useState({
    preset: site.theme?.preset ?? 'forest',
    brandColor: site.theme?.brandColor ?? '',
  });
  const [legal, setLegal] = useState<Record<LegalKey, string>>({
    terms: site.legal?.terms.text ?? '',
    termsOfUse: site.legal?.termsOfUse.text ?? '',
    privacy: site.legal?.privacy.text ?? '',
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmedSlug = slug.trim().toLowerCase();
  const slugChanged = Boolean(trimmedSlug && trimmedSlug !== (site.slug ?? ''));

  const slugCheck = useQuery({
    queryKey: [...staysKeys.site, 'slug-check', trimmedSlug],
    queryFn: () =>
      api.get<DataEnvelope<SlugCheckResult>>('/host/site/slug-check', { slug: trimmedSlug }),
    enabled: slugChanged && trimmedSlug.length >= 2,
  });

  const logoThumb = useAuthedBlobUrl(
    site.logoUploadId ? `/uploads/${site.logoUploadId}/content` : null,
  );

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const resized = await resizeImage(file, 800, 0.85);
      return api.upload<DataEnvelope<HostSite>>('/host/site/logo', {
        file: resized,
        filename: file.name.replace(/\.[^.]+$/, '.jpg'),
      });
    },
    onSuccess: async () => {
      toast.saved('Site logo updated.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.site });
    },
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<DataEnvelope<HostSite>>('/host/site', body),
    onSuccess: async () => {
      toast.saved('Booking site settings saved.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.site });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (published && !trimmedSlug) {
      setLocalError('Choose a web address first');
      return;
    }
    const ruleErr = validateStayRules(rules);
    if (ruleErr) {
      setLocalError(ruleErr);
      return;
    }

    save.mutate({
      slug: trimmedSlug || null,
      published,
      businessName: businessName.trim(),
      about: about.trim() || null,
      contactPhone: contactPhone.trim() || null,
      whatsappPhone: whatsappPhone.trim() || null,
      checkInTime,
      checkOutTime,
      houseRules: houseRules.trim() || null,
      rules: toApiRules(rules),
      themePreset: theme.preset,
      brandColor: theme.brandColor || null,
      ...(site.legal
        ? {
            termsText: legalPayload(legal.terms, site.legal.terms.starter),
            termsOfUseText: legalPayload(legal.termsOfUse, site.legal.termsOfUse.starter),
            privacyText: legalPayload(legal.privacy, site.legal.privacy.starter),
          }
        : {}),
    });
  };

  const errMsg = localError ?? (save.isError ? staysErrorMessage(save.error) : null);

  const paymentWarning = guestPaymentWarning(site.guestPayments, rules);

  return (
    <div className="pg" style={{ maxWidth: '48rem' }}>
      {paymentWarning ? (
        <div className="ad__callout ad__callout--warn" role="alert">
          <p>{paymentWarning}</p>
          {canManageChannels ? (
            <Link className="nx-btn nx-btn--sm" to="/app/payment-channels">
              Add a paybill or till
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Booking site settings">
          {SITE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className="pf__tab"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: '1.5rem' }}>
        <div hidden={tab !== 'address'}>
        <section
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            display: 'grid',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Web address & publishing</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Share this link on Instagram, WhatsApp or Google Maps so guests can book directly.
              </p>
            </div>
            {site.address ? (
              <a
                href={site.address}
                target="_blank"
                rel="noreferrer"
                className="nx-btn nx-btn--sm"
              >
                Open my site ↗
              </a>
            ) : null}
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="site-slug">Web address name (slug)</label>
            </div>
            <input
              id="site-slug"
              className="au__input"
              type="text"
              placeholder="e.g. cozy-stays"
              value={slug}
              disabled={!canUpdate}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            {slugChanged && slugCheck.data ? (
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8rem',
                  color: slugCheck.data.data.available ? 'var(--success)' : 'var(--destructive)',
                }}
              >
                {slugCheck.data.data.available
                  ? `${trimmedSlug} is available`
                  : slugCheck.data.data.problem}
              </p>
            ) : null}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={published}
              disabled={!canUpdate}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Publish my booking site (guests can browse and book online)
          </label>
        </section>
        </div>

        <div hidden={tab !== 'business'}>
        <section
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            display: 'grid',
            gap: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Business profile & contacts</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '0.5rem',
                overflow: 'hidden',
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {logoThumb.status === 'ready' ? (
                <img
                  src={logoThumb.url}
                  alt="Site logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No logo</span>
              )}
            </div>
            {canUpdate ? (
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo.mutate(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="nx-btn nx-btn--sm"
                  disabled={uploadLogo.isPending}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {uploadLogo.isPending ? 'Uploading…' : 'Upload logo'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="site-biz-name">Business name</label>
            </div>
            <input
              id="site-biz-name"
              className="au__input"
              type="text"
              value={businessName}
              disabled={!canUpdate}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="site-about">About your stays</label>
            </div>
            <textarea
              id="site-about"
              className="au__input"
              rows={3}
              placeholder="Short welcome message shown at the top of your booking site…"
              value={about}
              disabled={!canUpdate}
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="site-phone">Contact phone</label>
              </div>
              <input
                id="site-phone"
                className="au__input"
                type="tel"
                placeholder="0712 345 678"
                value={contactPhone}
                disabled={!canUpdate}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="site-whatsapp">WhatsApp number</label>
              </div>
              <input
                id="site-whatsapp"
                className="au__input"
                type="tel"
                placeholder="0712 345 678"
                value={whatsappPhone}
                disabled={!canUpdate}
                onChange={(e) => setWhatsappPhone(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="site-checkin">Default check-in time</label>
              </div>
              <input
                id="site-checkin"
                className="au__input"
                type="time"
                value={checkInTime}
                disabled={!canUpdate}
                onChange={(e) => setCheckInTime(e.target.value)}
              />
            </div>
            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="site-checkout">Default check-out time</label>
              </div>
              <input
                id="site-checkout"
                className="au__input"
                type="time"
                value={checkOutTime}
                disabled={!canUpdate}
                onChange={(e) => setCheckOutTime(e.target.value)}
              />
            </div>
          </div>
        </section>
        </div>

        <div hidden={tab !== 'rules'}>
        <section
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            display: 'grid',
            gap: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
            Default booking, payment & cancellation rules
          </h2>
          <RulesFields value={rules} onChange={setRules} disabled={!canUpdate} />

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="site-house-rules">House rules</label>
            </div>
            <textarea
              id="site-house-rules"
              className="au__input"
              rows={3}
              placeholder="e.g. No smoking indoors, quiet hours after 10 PM, ID required at check-in…"
              value={houseRules}
              disabled={!canUpdate}
              onChange={(e) => setHouseRules(e.target.value)}
            />
          </div>
        </section>
        </div>

        <div hidden={tab !== 'look'}>
        <ThemeFields
          preset={theme.preset}
          brandColor={theme.brandColor}
          disabled={!canUpdate}
          onChange={setTheme}
        />
        </div>

        <div hidden={tab !== 'legal'}>
        {site.legal ? (
          <LegalFields
            pages={site.legal}
            values={legal}
            siteAddress={site.address}
            disabled={!canUpdate}
            onChange={(key, text) => setLegal((l) => ({ ...l, [key]: text }))}
          />
        ) : null}
        </div>

        {errMsg ? (
          <p className="au__error" role="alert">
            {errMsg}
          </p>
        ) : null}

        {canUpdate ? (
          <div>
            <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save site settings'}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function SiteSettingsPage() {
  const siteQuery = useQuery({
    queryKey: staysKeys.site,
    queryFn: () => api.get<DataEnvelope<HostSite>>('/host/site'),
  });

  if (siteQuery.isPending) {
    return <p style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Loading booking site settings…</p>;
  }
  if (siteQuery.isError || !siteQuery.data) {
    return (
      <p className="ad__error" role="alert">
        {staysErrorMessage(siteQuery.error)}
      </p>
    );
  }

  const site = siteQuery.data.data;
  return <SiteSettingsForm key={`${site.slug ?? ''}:${site.published}:${site.businessName}`} site={site} />;
}
