export interface LandingHeroStat {
  label: string;
  value: string;
}

export interface LandingFeatureItem {
  tag: string;
  title: string;
  description: string;
}

export interface LandingPortalItem {
  title: string;
  description: string;
}

export interface LandingPageContent {
  brandName: string;
  pageTitle: string;
  metaDescription: string;
  signInLabel: string;
  registerLabel: string;
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  heroStatsTitle: string;
  heroStats: LandingHeroStat[];
  featuresTitle: string;
  featuresSubtitle: string;
  features: LandingFeatureItem[];
  portalsTitle: string;
  portalsSubtitle: string;
  portals: LandingPortalItem[];
  pricingBadge: string;
  pricingTitle: string;
  pricingSubtitle: string;
  pricingNote: string;
  defaultSliderUnits: number;
  fallbackRatePerUnit: number;
  fallbackMinimumMonthly: number;
  contactEmail: string | null;
  contactPhone: string | null;
  footerCopyright: string;
  footerTagline: string;
}

export const DEFAULT_LANDING_PAGE_CONTENT: LandingPageContent = {
  brandName: 'KodiHub',
  pageTitle: 'KodiHub — Property, Rent & M-Pesa Management for Kenyan Landlords & Agencies',
  metaDescription:
    'KodiHub helps Kenyan landlords and letting agencies automate rent invoicing, collect payments via M-Pesa Paybill/Till and bank, track water & power meters, manage unit maintenance, and remit to property owners.',
  signInLabel: 'Sign in',
  registerLabel: 'Create account',
  heroBadge: 'Built for Kenyan Landlords & Letting Agencies',
  heroTitle: 'Every unit, invoice, M-Pesa payment and payout in one place.',
  heroSubtitle:
    'Automate monthly rent and metered utility billing, reconcile M-Pesa Paybill/Till and bank statements automatically, track unit maintenance, and send branded PDF invoices and receipts.',
  heroPrimaryCta: 'Start free trial',
  heroSecondaryCta: 'Sign in to your account',
  heroStatsTitle: 'Sample portfolio snapshot',
  heroStats: [
    { label: 'Collected this month', value: 'KES 1,840,000.00' },
    { label: 'M-Pesa C2B auto-matched', value: '98.4%' },
    { label: 'Occupancy across 64 units', value: '95.3%' },
    { label: 'Receipts & PDF statements', value: 'Instant SMS + Email' },
  ],
  featuresTitle: 'Everything your property operations need',
  featuresSubtitle:
    'No spreadsheets or manual receipt books. KodiHub handles the full lifecycle from move-in to landlord remittance.',
  features: [
    {
      tag: 'M-Pesa & Banks',
      title: 'Real-time M-Pesa C2B, STK Push & Bank Imports',
      description:
        'Connect your Safaricom Paybill or Till. Payments match tenants by account reference or phone number automatically and allocate oldest-due first.',
    },
    {
      tag: 'Billing & Meters',
      title: 'Monthly Rent, Water & Power Meter Readings',
      description:
        'Record meter readings with photo proof and run an entire property’s monthly invoices in one click, complete with custom payment instructions.',
    },
    {
      tag: 'Communications',
      title: 'Branded PDF Invoices, Receipts & Reminders',
      description:
        'Every payment and invoice triggers an SMS and a detailed email with an official branded PDF receipt or invoice attached.',
    },
    {
      tag: 'Maintenance',
      title: 'Unit Repair Requests & Expense Conversion',
      description:
        'Tenants report issues with photos from their phone. Staff track progress, resolve tickets, and convert repair costs directly into property expenses.',
    },
    {
      tag: 'Letting Agencies',
      title: 'Management Agreements & Landlord Payouts',
      description:
        'Calculate agency commission, deduct approved property expenses, generate owner statements, and disburse net remittances via M-Pesa B2C.',
    },
    {
      tag: 'Web & Mobile',
      title: 'Staff, Owner & Tenant Portals',
      description:
        'Dedicated web and Android/iOS experiences for property managers, caretakers, landlords, and tenants—all backed by role-based permissions and audit logs.',
    },
  ],
  portalsTitle: 'Three tailored experiences',
  portalsSubtitle: 'Everyone sees only what belongs to them, on web or mobile.',
  portals: [
    {
      title: 'For Landlords & Property Staff',
      description:
        'Manage properties, units, tenancies, meter readings, invoice runs, payment reconciliation, maintenance tickets, and P&L reports.',
    },
    {
      title: 'For Tenants',
      description:
        'Sign in with a one-time SMS/email code, check current balance, trigger an M-Pesa STK prompt, download PDF receipts, and submit maintenance requests.',
    },
    {
      title: 'For Property Owners (Agencies)',
      description:
        'Read-only owner portal showing live occupancy, monthly owner statements, commission breakdowns, and remittance payout history.',
    },
  ],
  pricingBadge: 'Transparent per-unit pricing',
  pricingTitle: 'Pay only for occupied units',
  pricingSubtitle:
    'Vacant units are free. Every plan includes unlimited staff accounts, M-Pesa integration, PDF invoices & receipts, tenant and owner portals, and mobile app access.',
  pricingNote: 'Includes free trial for new organisations.',
  defaultSliderUnits: 25,
  fallbackRatePerUnit: 10_000,
  fallbackMinimumMonthly: 150_000,
  contactEmail: 'hello@kodihub.co.ke',
  contactPhone: null,
  footerCopyright: 'KodiHub Property Management. All rights reserved.',
  footerTagline: 'Built in Nairobi for landlords and letting agencies across Kenya.',
};

function cleanStr(val: unknown, fallback: string): string {
  return typeof val === 'string' && val.trim() ? val.trim() : fallback;
}

function cleanNullStr(val: unknown, fallback: string | null): string | null {
  if (val === null) return null;
  if (typeof val === 'string') return val.trim() || null;
  return fallback;
}

function cleanInt(val: unknown, fallback: number, min: number, max: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.min(max, Math.max(min, Math.trunc(val)));
  }
  return fallback;
}

export function readLandingPageContent(rawEmailTemplates: unknown): LandingPageContent {
  const raw =
    rawEmailTemplates && typeof rawEmailTemplates === 'object' && !Array.isArray(rawEmailTemplates)
      ? ((rawEmailTemplates as Record<string, unknown>)._landingPage as
          Partial<LandingPageContent> | undefined)
      : undefined;

  const d = DEFAULT_LANDING_PAGE_CONTENT;
  if (!raw || typeof raw !== 'object') {
    return {
      ...d,
      heroStats: d.heroStats.map((x) => ({ ...x })),
      features: d.features.map((x) => ({ ...x })),
      portals: d.portals.map((x) => ({ ...x })),
    };
  }

  const heroStats = Array.isArray(raw.heroStats)
    ? raw.heroStats
        .filter((item): item is LandingHeroStat =>
          Boolean(item && typeof item === 'object' && typeof item.label === 'string'),
        )
        .map((item) => ({
          label: item.label.trim(),
          value: typeof item.value === 'string' ? item.value.trim() : '',
        }))
        .filter((item) => item.label && item.value)
        .slice(0, 8)
    : d.heroStats.map((x) => ({ ...x }));

  const features = Array.isArray(raw.features)
    ? raw.features
        .filter((item): item is LandingFeatureItem =>
          Boolean(item && typeof item === 'object' && typeof item.title === 'string'),
        )
        .map((item) => ({
          tag: typeof item.tag === 'string' ? item.tag.trim() : '',
          title: item.title.trim(),
          description: typeof item.description === 'string' ? item.description.trim() : '',
        }))
        .filter((item) => item.title && item.description)
        .slice(0, 12)
    : d.features.map((x) => ({ ...x }));

  const portals = Array.isArray(raw.portals)
    ? raw.portals
        .filter((item): item is LandingPortalItem =>
          Boolean(item && typeof item === 'object' && typeof item.title === 'string'),
        )
        .map((item) => ({
          title: item.title.trim(),
          description: typeof item.description === 'string' ? item.description.trim() : '',
        }))
        .filter((item) => item.title && item.description)
        .slice(0, 6)
    : d.portals.map((x) => ({ ...x }));

  return {
    brandName: cleanStr(raw.brandName, d.brandName),
    pageTitle: cleanStr(raw.pageTitle, d.pageTitle),
    metaDescription: cleanStr(raw.metaDescription, d.metaDescription),
    signInLabel: cleanStr(raw.signInLabel, d.signInLabel),
    registerLabel: cleanStr(raw.registerLabel, d.registerLabel),
    heroBadge: cleanStr(raw.heroBadge, d.heroBadge),
    heroTitle: cleanStr(raw.heroTitle, d.heroTitle),
    heroSubtitle: cleanStr(raw.heroSubtitle, d.heroSubtitle),
    heroPrimaryCta: cleanStr(raw.heroPrimaryCta, d.heroPrimaryCta),
    heroSecondaryCta: cleanStr(raw.heroSecondaryCta, d.heroSecondaryCta),
    heroStatsTitle: cleanStr(raw.heroStatsTitle, d.heroStatsTitle),
    heroStats: heroStats.length > 0 ? heroStats : d.heroStats.map((x) => ({ ...x })),
    featuresTitle: cleanStr(raw.featuresTitle, d.featuresTitle),
    featuresSubtitle: cleanStr(raw.featuresSubtitle, d.featuresSubtitle),
    features: features.length > 0 ? features : d.features.map((x) => ({ ...x })),
    portalsTitle: cleanStr(raw.portalsTitle, d.portalsTitle),
    portalsSubtitle: cleanStr(raw.portalsSubtitle, d.portalsSubtitle),
    portals: portals.length > 0 ? portals : d.portals.map((x) => ({ ...x })),
    pricingBadge: cleanStr(raw.pricingBadge, d.pricingBadge),
    pricingTitle: cleanStr(raw.pricingTitle, d.pricingTitle),
    pricingSubtitle: cleanStr(raw.pricingSubtitle, d.pricingSubtitle),
    pricingNote: cleanStr(raw.pricingNote, d.pricingNote),
    defaultSliderUnits: cleanInt(raw.defaultSliderUnits, d.defaultSliderUnits, 1, 1000),
    fallbackRatePerUnit: cleanInt(raw.fallbackRatePerUnit, d.fallbackRatePerUnit, 0, 100_000_000),
    fallbackMinimumMonthly: cleanInt(
      raw.fallbackMinimumMonthly,
      d.fallbackMinimumMonthly,
      0,
      100_000_000,
    ),
    contactEmail: cleanNullStr(raw.contactEmail, d.contactEmail),
    contactPhone: cleanNullStr(raw.contactPhone, d.contactPhone),
    footerCopyright: cleanStr(raw.footerCopyright, d.footerCopyright),
    footerTagline: cleanStr(raw.footerTagline, d.footerTagline),
  };
}

export function mergeLandingPageContent(
  rawEmailTemplates: unknown,
  patch: Partial<LandingPageContent>,
  reset?: boolean,
): Record<string, unknown> {
  const container =
    rawEmailTemplates && typeof rawEmailTemplates === 'object' && !Array.isArray(rawEmailTemplates)
      ? { ...(rawEmailTemplates as Record<string, unknown>) }
      : {};

  if (reset) {
    delete container._landingPage;
    return container;
  }

  const current = readLandingPageContent(rawEmailTemplates);
  const merged = readLandingPageContent({
    _landingPage: {
      ...current,
      ...patch,
    },
  });
  container._landingPage = merged;
  return container;
}
