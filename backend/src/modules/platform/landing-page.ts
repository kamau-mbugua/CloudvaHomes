export interface LandingHeroStat {
  label: string;
  value: string;
}

export interface LandingHowStepItem {
  step: string;
  title: string;
  description: string;
}

export interface LandingFeatureItem {
  tag: string;
  title: string;
  description: string;
}

export interface LandingPortalItem {
  title: string;
  description: string;
  kicker?: string;
  badges?: string[];
}

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface LandingPageContent {
  topBarText: string;
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
  howTitle: string;
  howSubtitle: string;
  howSteps: LandingHowStepItem[];
  featuresTitle: string;
  featuresSubtitle: string;
  features: LandingFeatureItem[];
  reconTitle: string;
  reconSubtitle: string;
  portalsTitle: string;
  portalsSubtitle: string;
  portals: LandingPortalItem[];
  mobileTitle: string;
  mobileSubtitle: string;
  googlePlayUrl: string | null;
  appStoreUrl: string | null;
  agenciesTitle: string;
  agenciesSubtitle: string;
  pricingBadge: string;
  pricingTitle: string;
  pricingSubtitle: string;
  pricingNote: string;
  defaultSliderUnits: number;
  fallbackRatePerUnit: number;
  fallbackMinimumMonthly: number;
  faqTitle: string;
  faqs: LandingFaqItem[];
  ctaTitle: string;
  ctaSubtitle: string;
  contactEmail: string | null;
  contactPhone: string | null;
  footerCopyright: string;
  footerTagline: string;
}

export const DEFAULT_LANDING_PAGE_CONTENT: LandingPageContent = {
  topBarText: 'New organisations start with a free trial. Vacant units are never billed.',
  brandName: 'KodiHub',
  pageTitle: 'KodiHub: rent and M-Pesa management for Kenyan landlords',
  metaDescription:
    'KodiHub runs monthly rent and utility invoicing, matches every Paybill, Till and bank payment to the right tenant, and pays landlords their net remittance. Built for Kenyan landlords and letting agencies.',
  signInLabel: 'Sign in',
  registerLabel: 'Start free trial',
  heroBadge: 'Rent management software for Kenya',
  heroTitle: 'Collect rent on M-Pesa. Let the books reconcile themselves.',
  heroSubtitle:
    'KodiHub runs monthly rent and utility invoicing, matches every Paybill, Till and bank payment to the right tenant, and pays landlords their net remittance. Built for Kenyan landlords and letting agencies.',
  heroPrimaryCta: 'Start your free trial',
  heroSecondaryCta: 'See how it works',
  heroStatsTitle: 'Sample portfolio · October',
  heroStats: [
    { label: 'collected this month', value: 'KES 1,840,000' },
    { label: 'M-Pesa auto-matched', value: '98.4%' },
    { label: 'Occupancy, 64 units', value: '95.3%' },
    { label: 'Receipt books', value: '0' },
  ],
  howTitle: 'From move-in to landlord payout, one continuous ledger.',
  howSubtitle:
    'No spreadsheets, no manual receipt books. Each step feeds the next, so the numbers in your reports are the numbers in M-Pesa.',
  howSteps: [
    {
      step: '01 · Move in',
      title: 'Add units and tenants',
      description: 'Set rent, deposits and move-in fees per unit. Tenancies keep the full history.',
    },
    {
      step: '02 · Bill',
      title: 'Run invoices in one click',
      description: 'Rent, water and power for a whole property, with meter photos as proof.',
    },
    {
      step: '03 · Collect',
      title: 'Tenants pay how they like',
      description: 'Paybill, Till, an STK prompt from the portal, bank transfer or cash.',
    },
    {
      step: '04 · Reconcile',
      title: 'Payments find their invoice',
      description: 'Matched by account reference or phone, allocated oldest-due first.',
    },
    {
      step: '05 · Remit',
      title: 'Pay the owner',
      description: 'Commission and expenses deducted, net sent to the landlord by M-Pesa B2C.',
    },
  ],
  featuresTitle: "Everything your property operations need, nothing they don't.",
  featuresSubtitle:
    'One system for property managers, accountants, caretakers, landlords and tenants, each with exactly the access their role needs.',
  features: [
    {
      tag: 'M-Pesa and banks',
      title: 'Real-time C2B, STK Push and bank imports',
      description:
        'Connect your Safaricom Paybill or Till. Payments land against the right tenant automatically, and anything unclear waits in a review queue.',
    },
    {
      tag: 'Billing and meters',
      title: 'Rent, water and power on one invoice',
      description:
        "Caretakers record meter readings with a photo. Fixed, variable and metered charges roll into each month's invoice run.",
    },
    {
      tag: 'Communications',
      title: 'Branded PDF invoices, receipts and reminders',
      description:
        'Every invoice and payment sends an SMS and an email with an official PDF attached. Reminders go out before rent is due.',
    },
    {
      tag: 'Maintenance',
      title: 'Repair requests that close the loop',
      description:
        'Tenants report issues with photos from their phone. Staff track each ticket and turn repair costs into property expenses.',
    },
    {
      tag: 'Reports',
      title: 'Arrears, occupancy and P&L per property',
      description:
        'See who owes what, which units sit empty, and what each property actually earns after expenses.',
    },
    {
      tag: 'Access and audit',
      title: 'Roles, permissions and a full audit log',
      description:
        'Caretakers never touch money settings. Accountants see the ledger. Every change is recorded with who made it and when.',
    },
  ],
  reconTitle: 'Month-end close in minutes, not a weekend.',
  reconSubtitle:
    'Every shilling that arrives is logged as it lands, then matched and allocated. Your team only handles the exceptions.',
  portalsTitle: 'Three tailored experiences. Everyone sees only what is theirs.',
  portalsSubtitle: 'Each portal shows only what is relevant to that role on web and mobile.',
  portals: [
    {
      kicker: 'For landlords and staff',
      title: 'Run the whole portfolio',
      description:
        'Properties, units, tenancies, meter readings, invoice runs, reconciliation, maintenance and P&L, with menus filtered by role.',
      badges: ['Owner', 'Manager', 'Accountant', 'Caretaker'],
    },
    {
      kicker: 'For tenants',
      title: 'Pay rent in two taps',
      description:
        'Sign in with a one-time code by SMS or email, check the balance, trigger an M-Pesa prompt, download receipts and raise repair requests.',
      badges: ['No password needed', 'Android and iOS'],
    },
    {
      kicker: 'For property owners',
      title: 'See your money, read-only',
      description:
        'Owners of agency-managed properties see live occupancy, monthly owner statements, commission breakdowns and every remittance paid.',
      badges: ['Owner statements', 'Payout history'],
    },
  ],
  mobileTitle: "Your properties in your pocket. Your tenants' rent in theirs.",
  mobileSubtitle:
    'One app, two experiences. Tenants see what they owe and pay in seconds. Staff and caretakers run the day from the compound, not the office.',
  googlePlayUrl: null,
  appStoreUrl: null,
  agenciesTitle: 'Manage for many landlords. Remit to each one, on time.',
  agenciesSubtitle:
    'Set a management agreement per landlord with commission and remittance day. KodiHub builds the owner statement, deducts approved expenses and sends the net by M-Pesa B2C.',
  pricingBadge: 'Free trial included',
  pricingTitle: 'Pay only for occupied units. Vacant units are free.',
  pricingSubtitle:
    'One simple rate, whether you own a single block or manage for fifty landlords. Every plan includes:',
  pricingNote: 'Create your organisation',
  defaultSliderUnits: 25,
  fallbackRatePerUnit: 10_000,
  fallbackMinimumMonthly: 150_000,
  faqTitle: 'Questions landlords ask us',
  faqs: [
    {
      question: 'Which payment methods can tenants use?',
      answer:
        'M-Pesa Paybill and Till, an STK Push prompt sent from the tenant portal, bank transfers through statement imports, plus cash and cheque recorded by your staff. All of them land in the same ledger.',
    },
    {
      question: 'Do I pay for vacant units?',
      answer:
        'No. You are billed per occupied unit each month, with a small monthly minimum. Empty units cost nothing.',
    },
    {
      question: 'How does automatic M-Pesa matching work?',
      answer:
        "When a payment arrives, KodiHub reads the account reference and the payer's phone number, finds the tenant and clears their oldest unpaid invoice first. Payments it cannot place go to a review queue.",
    },
    {
      question: 'Is KodiHub suitable for letting agencies?',
      answer:
        'Yes. Agencies set up management agreements per landlord, earn commission automatically, deduct approved expenses and remit the net to each owner, who gets a read-only portal.',
    },
    {
      question: 'Can caretakers use it from their phone?',
      answer:
        'Yes. The Android and iOS app lets caretakers capture meter readings with photos, update unit status and handle move-ins and move-outs, without access to money settings.',
    },
    {
      question: 'Can I bring my existing tenants and balances?',
      answer:
        'Yes. Import your units, tenants and opening balances in bulk via CSV, or let our team help your organisation set up properties, units, tenants and opening balances during the free trial.',
    },
  ],
  ctaTitle: "Close this month's books before the 5th.",
  ctaSubtitle:
    'Set up your first property in an afternoon. Your tenants get receipts the moment they pay.',
  contactEmail: 'hello@kodihub.co.ke',
  contactPhone: null,
  footerCopyright: 'KodiHub Property Management. All rights reserved.',
  footerTagline:
    'Rent, utilities, M-Pesa and landlord payouts in one place. Built in Nairobi for landlords and letting agencies across Kenya.',
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
      howSteps: d.howSteps.map((x) => ({ ...x })),
      features: d.features.map((x) => ({ ...x })),
      portals: d.portals.map((x) => ({ ...x, badges: x.badges ? [...x.badges] : undefined })),
      faqs: d.faqs.map((x) => ({ ...x })),
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

  const howSteps = Array.isArray(raw.howSteps)
    ? raw.howSteps
        .filter((item): item is LandingHowStepItem =>
          Boolean(item && typeof item === 'object' && typeof item.title === 'string'),
        )
        .map((item, idx) => ({
          step:
            typeof item.step === 'string' && item.step.trim() ? item.step.trim() : `0${idx + 1}`,
          title: item.title.trim(),
          description: typeof item.description === 'string' ? item.description.trim() : '',
        }))
        .filter((item) => item.title && item.description)
        .slice(0, 8)
    : d.howSteps.map((x) => ({ ...x }));

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
        .map((item, idx) => {
          const defPortal = d.portals[idx];
          const badges = Array.isArray(item.badges)
            ? item.badges
                .filter((b): b is string => typeof b === 'string' && Boolean(b.trim()))
                .map((b) => b.trim())
                .slice(0, 6)
            : defPortal?.badges
              ? [...defPortal.badges]
              : undefined;
          return {
            kicker:
              typeof item.kicker === 'string' && item.kicker.trim()
                ? item.kicker.trim()
                : defPortal?.kicker,
            title: item.title.trim(),
            description: typeof item.description === 'string' ? item.description.trim() : '',
            badges,
          };
        })
        .filter((item) => item.title && item.description)
        .slice(0, 6)
    : d.portals.map((x) => ({ ...x, badges: x.badges ? [...x.badges] : undefined }));

  const faqs = Array.isArray(raw.faqs)
    ? raw.faqs
        .filter((item): item is LandingFaqItem =>
          Boolean(item && typeof item === 'object' && typeof item.question === 'string'),
        )
        .map((item) => ({
          question: item.question.trim(),
          answer: typeof item.answer === 'string' ? item.answer.trim() : '',
        }))
        .filter((item) => item.question && item.answer)
        .slice(0, 12)
    : d.faqs.map((x) => ({ ...x }));

  return {
    topBarText: cleanStr(raw.topBarText, d.topBarText),
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
    howTitle: cleanStr(raw.howTitle, d.howTitle),
    howSubtitle: cleanStr(raw.howSubtitle, d.howSubtitle),
    howSteps: howSteps.length > 0 ? howSteps : d.howSteps.map((x) => ({ ...x })),
    featuresTitle: cleanStr(raw.featuresTitle, d.featuresTitle),
    featuresSubtitle: cleanStr(raw.featuresSubtitle, d.featuresSubtitle),
    features: features.length > 0 ? features : d.features.map((x) => ({ ...x })),
    reconTitle: cleanStr(raw.reconTitle, d.reconTitle),
    reconSubtitle: cleanStr(raw.reconSubtitle, d.reconSubtitle),
    portalsTitle: cleanStr(raw.portalsTitle, d.portalsTitle),
    portalsSubtitle: cleanStr(raw.portalsSubtitle, d.portalsSubtitle),
    portals:
      portals.length > 0
        ? portals
        : d.portals.map((x) => ({ ...x, badges: x.badges ? [...x.badges] : undefined })),
    mobileTitle: cleanStr(raw.mobileTitle, d.mobileTitle),
    mobileSubtitle: cleanStr(raw.mobileSubtitle, d.mobileSubtitle),
    googlePlayUrl: cleanNullStr(raw.googlePlayUrl, d.googlePlayUrl),
    appStoreUrl: cleanNullStr(raw.appStoreUrl, d.appStoreUrl),
    agenciesTitle: cleanStr(raw.agenciesTitle, d.agenciesTitle),
    agenciesSubtitle: cleanStr(raw.agenciesSubtitle, d.agenciesSubtitle),
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
    faqTitle: cleanStr(raw.faqTitle, d.faqTitle),
    faqs: faqs.length > 0 ? faqs : d.faqs.map((x) => ({ ...x })),
    ctaTitle: cleanStr(raw.ctaTitle, d.ctaTitle),
    ctaSubtitle: cleanStr(raw.ctaSubtitle, d.ctaSubtitle),
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
