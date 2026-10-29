export const EMAIL_TEMPLATE_KEYS = [
  'owner_welcome',
  'staff_invitation',
  'platform_invoice',
  'verification_code',
  'owner_portal_access',
  'payout_changed',
  'tenant_welcome',
  'tenant_added_to_org',
  'tenant_unit_assigned',
  'tenant_invoice',
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailTemplateVariable {
  key: string;
  description: string;
  sample: string;
}

export interface EmailTemplateDefinition {
  key: EmailTemplateKey;
  name: string;
  category:
    'Onboarding & Invitations' | 'Platform Billing' | 'Security & Access' | 'Tenant Communications';
  description: string;
  defaultSubject: string;
  defaultBody: string;
  variables: EmailTemplateVariable[];
}

export interface StoredEmailTemplateOverride {
  subject?: string;
  body?: string;
  updatedAt?: string;
}

export type StoredEmailTemplatesMap = Partial<
  Record<EmailTemplateKey, StoredEmailTemplateOverride>
>;

export interface ResolvedEmailTemplate extends EmailTemplateDefinition {
  subject: string;
  body: string;
  customized: boolean;
  updatedAt: string | null;
}

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateDefinition> = {
  owner_welcome: {
    key: 'owner_welcome',
    name: 'Organisation Owner Welcome & Billing Setup',
    category: 'Onboarding & Invitations',
    description:
      'Sent to the organisation owner when a new organisation is created by platform staff, including login link, trial window, and billing reference.',
    defaultSubject: 'Welcome to KodiHub — Set up {{organizationName}}',
    defaultBody:
      'Hi {{firstName}},\n\n' +
      '{{inviterLine}} to join {{organizationName}} on KodiHub.\n\n' +
      'Accept the invitation: {{inviteLink}}\n\n' +
      'The link expires in 7 days.\n\n' +
      '--- Login & Account Setup ---\n' +
      'Sign-in identifier: {{signInIdentifier}}\n' +
      'Set password & sign in: {{inviteLink}}\n\n' +
      '--- Subscription & Free Trial ---\n' +
      'Plan: {{planName}}\n' +
      'Rate: KES {{pricePerUnitKes}} per let unit / month (monthly minimum KES {{minimumMonthlyKes}})\n' +
      '{{trialSummary}}\n' +
      '{{billingRefLine}}',
    variables: [
      { key: 'firstName', description: "Owner's first name", sample: 'Wanjiku' },
      {
        key: 'organizationName',
        description: 'Name of the onboarded organisation',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'inviterLine',
        description:
          'Who invited the user (e.g. "Jane Doe invited you" or "You have been invited")',
        sample: 'KodiHub Platform Admin invited you',
      },
      {
        key: 'inviteLink',
        description: 'One-time link to set password and activate the account',
        sample: 'https://app.kodihub.co.ke/invite/sample-token-123',
      },
      {
        key: 'signInIdentifier',
        description: 'Email and/or phone number the owner can use to sign in',
        sample: 'wanjiku@kilimanicrest.co.ke or +254712345678',
      },
      { key: 'planName', description: 'Assigned subscription plan name', sample: 'Standard' },
      {
        key: 'pricePerUnitKes',
        description: 'Monthly price per occupied unit in KES',
        sample: '100',
      },
      {
        key: 'minimumMonthlyKes',
        description: 'Minimum monthly invoice amount in KES',
        sample: '2,000',
      },
      {
        key: 'trialEndsAt',
        description: 'Free trial end date (or "No free trial")',
        sample: '2026-11-12',
      },
      {
        key: 'firstPaidDate',
        description: 'Date when paid subscription billing starts',
        sample: '2026-11-13',
      },
      {
        key: 'firstInvoiceDate',
        description: 'Date when the first monthly platform invoice will be issued',
        sample: '2026-12-01',
      },
      { key: 'dueDays', description: 'Payment terms in days after invoice issue', sample: '7' },
      {
        key: 'trialSummary',
        description: 'Formatted summary of trial end date and first invoice date',
        sample:
          'Free trial ends: 2026-11-12\nPaid billing starts: 2026-11-13 (first invoice issued on 2026-12-01, due within 7 days)',
      },
      {
        key: 'billingRef',
        description: 'Unique M-Pesa billing reference code for the organisation',
        sample: 'H00042',
      },
      { key: 'paybill', description: 'Platform M-Pesa Paybill number', sample: '4098123' },
      {
        key: 'billingRefLine',
        description: 'Formatted billing reference and Paybill line',
        sample: 'Billing account reference: H00042 (M-Pesa Paybill 4098123)',
      },
    ],
  },
  staff_invitation: {
    key: 'staff_invitation',
    name: 'Team & Staff Invitation',
    category: 'Onboarding & Invitations',
    description:
      'Sent when an organisation owner or manager invites a property manager, accountant, or caretaker to join their team.',
    defaultSubject: 'Join {{organizationName}} on KodiHub',
    defaultBody:
      'Hi {{firstName}},\n\n' +
      '{{inviterLine}} to join {{organizationName}} on KodiHub.\n\n' +
      'Accept the invitation: {{inviteLink}}\n\n' +
      'The link expires in 7 days.',
    variables: [
      { key: 'firstName', description: "Invitee's first name", sample: 'Kamau' },
      {
        key: 'organizationName',
        description: 'Organisation name',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'inviterLine',
        description: 'Who sent the invite (e.g. "Wanjiku Mwangi invited you")',
        sample: 'Wanjiku Mwangi invited you',
      },
      {
        key: 'inviteLink',
        description: 'Invitation acceptance URL',
        sample: 'https://app.kodihub.co.ke/invite/sample-token-456',
      },
    ],
  },
  platform_invoice: {
    key: 'platform_invoice',
    name: 'Monthly Subscription Invoice Issued',
    category: 'Platform Billing',
    description:
      'Sent to the organisation owner when a monthly KodiHub platform invoice is generated after their free trial (with the PDF invoice attached).',
    defaultSubject: 'KodiHub Invoice {{invoiceNumber}} ({{period}}) — {{organizationName}}',
    defaultBody:
      '{{greeting}}\n\n' +
      'Your KodiHub subscription invoice {{invoiceNumber}} for {{organizationName}} (period {{period}}) has been issued. A copy of the PDF invoice is attached to this email.\n\n' +
      '--- Invoice Summary ---\n' +
      'Invoice number: {{invoiceNumber}}\n' +
      'Billing period: {{period}}\n' +
      'Let (occupied) units: {{occupiedUnits}} @ KES {{rateKes}} / unit (minimum KES {{minimumKes}})\n' +
      'Total billed: KES {{totalKes}}\n' +
      'Credit / paid applied: KES {{amountPaidKes}}\n' +
      'Balance due: KES {{balanceKes}}\n' +
      'Due date: {{dueDate}}\n\n' +
      '{{paymentInstructions}}',
    variables: [
      {
        key: 'greeting',
        description: 'Personalised greeting line (e.g. "Hi Wanjiku," or "Hello Kilimani Crest,")',
        sample: 'Hi Wanjiku,',
      },
      {
        key: 'organizationName',
        description: 'Organisation name',
        sample: 'Kilimani Crest Estates',
      },
      { key: 'invoiceNumber', description: 'Platform invoice number', sample: 'PINV-202611-0001' },
      { key: 'period', description: 'Billing month (YYYY-MM)', sample: '2026-11' },
      { key: 'occupiedUnits', description: 'Number of occupied/let units billed', sample: '38' },
      { key: 'rateKes', description: 'Per-unit monthly rate in KES', sample: '100' },
      { key: 'minimumKes', description: 'Monthly minimum in KES', sample: '2,000' },
      { key: 'totalKes', description: 'Total invoice amount in KES', sample: '3,800' },
      {
        key: 'amountPaidKes',
        description: 'Credit or payment already applied in KES',
        sample: '0',
      },
      { key: 'balanceKes', description: 'Remaining balance due in KES', sample: '3,800' },
      { key: 'dueDate', description: 'Invoice due date (YYYY-MM-DD)', sample: '2026-11-08' },
      { key: 'billingRef', description: 'Organisation billing reference', sample: 'H00042' },
      { key: 'paybill', description: 'Platform M-Pesa Paybill number', sample: '4098123' },
      {
        key: 'paymentInstructions',
        description: 'Complete M-Pesa Paybill & portal payment instructions',
        sample:
          'Pay via M-Pesa Paybill 4098123, Account H00042, or in KodiHub under Settings -> Plan & billing (https://app.kodihub.co.ke/settings/billing).',
      },
    ],
  },
  verification_code: {
    key: 'verification_code',
    name: 'Verification & Security Code (OTP / 2FA)',
    category: 'Security & Access',
    description:
      'Sent for sign-in codes, password resets, step-up confirmation, and superadmin 2FA verification.',
    defaultSubject: 'Your KodiHub {{codeType}}',
    defaultBody:
      "Your KodiHub {{codeType}} is {{code}}. It expires in {{minutes}} minutes. Don't share it with anyone.",
    variables: [
      {
        key: 'codeType',
        description:
          'Purpose of the code ("sign-in code", "password reset code", "confirmation code", or "admin sign-in code")',
        sample: 'sign-in code',
      },
      { key: 'code', description: '6-digit verification code', sample: '482910' },
      { key: 'minutes', description: 'Expiry window in minutes', sample: '10' },
    ],
  },
  owner_portal_access: {
    key: 'owner_portal_access',
    name: 'Landlord Owner-Portal Access',
    category: 'Onboarding & Invitations',
    description:
      'Sent when a property manager grants a property owner (landlord) read-only access to their property statements.',
    defaultSubject: 'Your statements from {{organizationName}}',
    defaultBody:
      '{{organizationName}} has given you access to your property statements on KodiHub: {{portalLink}} - sign in with a code sent to this phone or email.',
    variables: [
      {
        key: 'organizationName',
        description: 'Managing agency or organisation name',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'portalLink',
        description: 'Link to the landlord owner portal',
        sample: 'https://app.kodihub.co.ke/owner',
      },
    ],
  },
  payout_changed: {
    key: 'payout_changed',
    name: 'Landlord Payout Account Changed Alert',
    category: 'Security & Access',
    description:
      'Security alert sent to a landlord whenever their rent disbursement bank or M-Pesa payout details are changed or removed.',
    defaultSubject: 'Your payout details were changed',
    defaultBody:
      '{{organizationName}}: the account your rent payouts go to was changed {{changeDescription}}. If you did not ask for this, contact them now.',
    variables: [
      {
        key: 'organizationName',
        description: 'Managing agency or organisation name',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'changeDescription',
        description:
          'Masked destination account or removal notice (e.g. "to ****4321" or "were removed")',
        sample: 'to ****4321',
      },
    ],
  },
  tenant_welcome: {
    key: 'tenant_welcome',
    name: 'Tenant Welcome to KodiHub',
    category: 'Tenant Communications',
    description:
      'Sent only when a brand-new tenant (who does not yet exist on KodiHub) is registered by an organisation or imported via CSV.',
    defaultSubject: 'Welcome to {{organizationName}} on KodiHub',
    defaultBody:
      'Hi {{firstName}},\n\n' +
      'Welcome to KodiHub! {{organizationName}} has created your tenant profile.\n\n' +
      '--- Your Tenant Account ---\n' +
      'Organisation: {{organizationName}}\n' +
      'Tenant account code: {{tenantCode}}\n' +
      'Sign-in phone / email: {{signInIdentifier}}\n' +
      'Tenant portal: {{portalLink}}\n\n' +
      'Whenever you are assigned a house or billed for rent and utilities, you will receive updates here and can view your statements and receipts in the tenant portal.',
    variables: [
      { key: 'firstName', description: "Tenant's first name", sample: 'Grace' },
      { key: 'lastName', description: "Tenant's last name", sample: 'Wanjiku' },
      {
        key: 'organizationName',
        description: 'Name of the landlord or managing agency',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'tenantCode',
        description: 'Unique tenant account code used for payments',
        sample: 'T00001',
      },
      {
        key: 'signInIdentifier',
        description: 'Phone number and/or email on file for the tenant',
        sample: '+254712345678 / grace@example.com',
      },
      {
        key: 'portalLink',
        description: 'URL to the KodiHub Tenant Portal',
        sample: 'https://app.kodihub.co.ke/tenant',
      },
    ],
  },
  tenant_added_to_org: {
    key: 'tenant_added_to_org',
    name: 'Existing User Added as Tenant',
    category: 'Tenant Communications',
    description:
      'Sent when a tenant who already exists on KodiHub is added to a new organisation without an immediate unit assignment.',
    defaultSubject: 'You have been added to {{organizationName}} on KodiHub',
    defaultBody:
      'Hi {{firstName}},\n\n' +
      'You have been added as a tenant under {{organizationName}} on KodiHub.\n\n' +
      '--- Account Details ---\n' +
      'Organisation: {{organizationName}}\n' +
      'Tenant account code: {{tenantCode}}\n' +
      'Tenant portal: {{portalLink}}',
    variables: [
      { key: 'firstName', description: "Tenant's first name", sample: 'Grace' },
      { key: 'lastName', description: "Tenant's last name", sample: 'Wanjiku' },
      {
        key: 'organizationName',
        description: 'Name of the landlord or managing agency',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'tenantCode',
        description: 'Unique tenant account code in this organisation',
        sample: 'T00001',
      },
      {
        key: 'portalLink',
        description: 'URL to the KodiHub Tenant Portal',
        sample: 'https://app.kodihub.co.ke/tenant',
      },
    ],
  },
  tenant_unit_assigned: {
    key: 'tenant_unit_assigned',
    name: 'Tenant Assigned to a House / Unit',
    category: 'Tenant Communications',
    description:
      'Sent every time a tenant is assigned to a house/unit (including additional units in the same property or across different properties, and during CSV import).',
    defaultSubject:
      'You have been added to {{propertyName}} (Unit {{unitNumber}}) — {{organizationName}}',
    defaultBody:
      'Hi {{firstName}},\n\n' +
      'You have been assigned to Unit {{unitNumber}} at {{propertyName}} managed by {{organizationName}}.\n\n' +
      '--- House & Tenancy Details ---\n' +
      'Property: {{propertyName}} ({{propertyCode}})\n' +
      'Unit / House: {{unitNumber}}\n' +
      'Monthly rent: KES {{rentKes}}\n' +
      'Move-in date: {{startDate}}\n' +
      'Monthly billing day: Day {{billingDay}} of each month\n' +
      'Opening deposit recorded: KES {{depositHeldKes}}\n' +
      'Tenant account code: {{tenantCode}}\n' +
      'Your occupied units: {{occupiedUnitsSummary}}\n\n' +
      '--- How to Pay & Portal ---\n' +
      '{{paymentInstructions}}\n' +
      'Tenant portal: {{portalLink}}',
    variables: [
      { key: 'firstName', description: "Tenant's first name", sample: 'Grace' },
      { key: 'lastName', description: "Tenant's last name", sample: 'Wanjiku' },
      {
        key: 'organizationName',
        description: 'Name of the landlord or managing agency',
        sample: 'Kilimani Crest Estates',
      },
      {
        key: 'tenantCode',
        description: 'Unique tenant account code used for Paybill/Bank payments',
        sample: 'T00001',
      },
      {
        key: 'propertyName',
        description: 'Name of the property where the unit is located',
        sample: 'Ivory Breeze Apartments',
      },
      { key: 'propertyCode', description: 'Short code of the property', sample: 'IVB' },
      { key: 'unitNumber', description: 'House / unit number assigned', sample: 'A1' },
      { key: 'rentKes', description: 'Monthly rent for this unit in KES', sample: '35,000.00' },
      { key: 'startDate', description: 'Move-in / start date (YYYY-MM-DD)', sample: '2026-10-01' },
      {
        key: 'billingDay',
        description: 'Day of the month rent falls due (1–28)',
        sample: '5',
      },
      {
        key: 'depositHeldKes',
        description: 'Opening deposit recorded on move-in in KES',
        sample: '35,000.00',
      },
      {
        key: 'occupiedUnitsSummary',
        description: 'All active units currently occupied by this tenant in the organisation',
        sample: 'Ivory Breeze Apartments (A1, A2)',
      },
      {
        key: 'paymentInstructions',
        description: 'Paybill / Bank payment instructions for this property',
        sample: 'Pay via M-Pesa Paybill 600111, Account T00001.',
      },
      {
        key: 'portalLink',
        description: 'URL to the KodiHub Tenant Portal',
        sample: 'https://app.kodihub.co.ke/tenant',
      },
    ],
  },
  tenant_invoice: {
    key: 'tenant_invoice',
    name: 'Tenant Invoice Issued',
    category: 'Tenant Communications',
    description:
      'Sent to the tenant whenever a Move-In, Monthly, or Ad-hoc invoice is issued for any of their units (with the PDF invoice attached).',
    defaultSubject:
      'Invoice {{invoiceNumber}} ({{period}}) for {{propertyName}} ({{unitNumber}}) — KES {{balanceKes}}',
    defaultBody:
      'Hi {{firstName}},\n\n' +
      'A new {{invoiceKind}} invoice {{invoiceNumber}} has been issued for Unit {{unitNumber}} at {{propertyName}} ({{organizationName}}). A copy of the official PDF invoice is attached to this email.\n\n' +
      '--- Invoice Summary ---\n' +
      'Invoice number: {{invoiceNumber}}\n' +
      'Property & Unit: {{propertyName}} — Unit {{unitNumber}}\n' +
      'Billing period: {{period}}\n' +
      'Issue date: {{issueDate}}\n' +
      'Due date: {{dueDate}}\n\n' +
      '--- Breakdown ---\n' +
      '{{linesSummary}}\n\n' +
      'Total billed: KES {{totalKes}}\n' +
      'Paid / credited: KES {{amountPaidKes}}\n' +
      'Balance due: KES {{balanceKes}}\n\n' +
      '--- How to Pay ---\n' +
      '{{paymentInstructions}}\n' +
      'View & download PDF in the Tenant Portal: {{portalLink}}',
    variables: [
      { key: 'firstName', description: "Tenant's first name", sample: 'Grace' },
      { key: 'lastName', description: "Tenant's last name", sample: 'Wanjiku' },
      {
        key: 'organizationName',
        description: 'Name of the landlord or managing agency',
        sample: 'Kilimani Crest Estates',
      },
      { key: 'tenantCode', description: 'Tenant account reference code', sample: 'T00001' },
      { key: 'invoiceNumber', description: 'Invoice number', sample: 'INV-2026-000042' },
      {
        key: 'invoiceKind',
        description: 'Human-readable invoice type (Monthly, Move-in, or Ad-hoc)',
        sample: 'Monthly',
      },
      { key: 'period', description: 'Billing month (YYYY-MM)', sample: '2026-10' },
      { key: 'propertyName', description: 'Property name', sample: 'Ivory Breeze Apartments' },
      { key: 'unitNumber', description: 'Unit / house number', sample: 'A1' },
      {
        key: 'issueDate',
        description: 'Date invoice was issued (YYYY-MM-DD)',
        sample: '2026-10-01',
      },
      { key: 'dueDate', description: 'Date payment is due (YYYY-MM-DD)', sample: '2026-10-08' },
      {
        key: 'linesSummary',
        description: 'Formatted list of line items on the invoice',
        sample: '- Rent (2026-10): KES 35,000.00\n- Garbage: KES 500.00',
      },
      { key: 'totalKes', description: 'Total invoice amount in KES', sample: '35,500.00' },
      {
        key: 'amountPaidKes',
        description: 'Amount already paid or credited in KES',
        sample: '0.00',
      },
      {
        key: 'balanceKes',
        description: 'Remaining balance due on this invoice in KES',
        sample: '35,500.00',
      },
      {
        key: 'paymentInstructions',
        description: 'Paybill / Bank payment instructions for this property',
        sample: 'Pay via M-Pesa Paybill 600111, Account T00001.',
      },
      {
        key: 'portalLink',
        description: 'URL to the KodiHub Tenant Portal',
        sample: 'https://app.kodihub.co.ke/tenant',
      },
    ],
  },
};

export function isEmailTemplateKey(key: string): key is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key);
}

export function parseStoredEmailTemplates(raw: unknown): StoredEmailTemplatesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: StoredEmailTemplatesMap = {};
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const entry = (raw as Record<string, unknown>)[key];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const e = entry as Record<string, unknown>;
      const subject =
        typeof e.subject === 'string' && e.subject.trim() ? e.subject.trim() : undefined;
      const body = typeof e.body === 'string' && e.body.trim() ? e.body.trim() : undefined;
      const updatedAt = typeof e.updatedAt === 'string' ? e.updatedAt : undefined;
      if (subject || body) {
        result[key] = { subject, body, updatedAt };
      }
    }
  }
  return result;
}

export function resolveEmailTemplate(
  key: EmailTemplateKey,
  rawOverrides?: unknown,
): ResolvedEmailTemplate {
  const def = DEFAULT_EMAIL_TEMPLATES[key];
  const map = parseStoredEmailTemplates(rawOverrides);
  const override = map[key];
  const subject = override?.subject ?? def.defaultSubject;
  const body = override?.body ?? def.defaultBody;
  const customized = Boolean(
    (override?.subject && override.subject !== def.defaultSubject) ||
    (override?.body && override.body !== def.defaultBody),
  );
  return {
    ...def,
    subject,
    body,
    customized,
    updatedAt: customized ? (override?.updatedAt ?? null) : null,
  };
}

export function resolveAllEmailTemplates(rawOverrides?: unknown): ResolvedEmailTemplate[] {
  return EMAIL_TEMPLATE_KEYS.map((key) => resolveEmailTemplate(key, rawOverrides));
}

/**
 * Replaces `{{variable}}` placeholders in a template string with values from `vars`.
 * Unknown placeholders are left untouched so admins can spot typos in previews.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const val = vars[key];
      return val === null || val === undefined ? '' : String(val);
    }
    return full;
  });
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyHtml(escapedText: string): string {
  return escapedText.replace(
    /(https?:\/\/[^\s<)"']+)/g,
    '<a href="$1" style="color:#365314;text-decoration:underline;font-weight:500;">$1</a>',
  );
}

/**
 * Wraps a plain-text email body into a clean, responsive KodiHub HTML email layout.
 */
export function renderBrandedEmailHtml(opts: {
  subject: string;
  text: string;
  brandName?: string;
}): string {
  const brand = escapeHtml(opts.brandName?.trim() || 'KodiHub');
  const subject = escapeHtml(opts.subject);
  const lines = opts.text.replace(/\r\n/g, '\n').split('\n');
  const htmlBlocks: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      htmlBlocks.push('<div style="height:12px;"></div>');
      continue;
    }
    const sectionMatch = /^---\s*(.+?)\s*---$/.exec(trimmed);
    if (sectionMatch) {
      htmlBlocks.push(
        `<div style="margin:18px 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#3f6212;">${escapeHtml(sectionMatch[1]!)}</div>`,
      );
      continue;
    }
    const kvMatch = /^([A-Za-z][A-Za-z0-9 ()/-]{1,36}):\s+(.+)$/.exec(trimmed);
    if (kvMatch) {
      htmlBlocks.push(
        `<div style="margin:4px 0;font-size:14px;line-height:1.55;color:#1f2937;"><strong style="color:#111827;">${escapeHtml(kvMatch[1]!)}:</strong> ${linkifyHtml(escapeHtml(kvMatch[2]!))}</div>`,
      );
      continue;
    }
    htmlBlocks.push(
      `<p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#1f2937;">${linkifyHtml(escapeHtml(rawLine))}</p>`,
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f0;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e5e5e0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#1a2e05;padding:18px 24px;">
              <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">${brand}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              ${htmlBlocks.join('\n              ')}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background-color:#fafaf7;border-top:1px solid #ecece6;font-size:12px;color:#6b7280;">
              Sent by ${brand} · Property Management Platform
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
