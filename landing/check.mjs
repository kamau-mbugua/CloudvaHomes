#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(dir, 'index.html');
const html = readFileSync(htmlPath, 'utf8');

const errors = [];

if (!html.includes('<!doctype html>')) {
  errors.push('Missing <!doctype html> declaration');
}

if (!html.includes('/api/v1/public/landing')) {
  errors.push('Landing page must fetch dynamic content from /api/v1/public/landing');
}

// 1. Verify all DOM IDs required by the superadmin content renderer exist in index.html
const REQUIRED_IDS = [
  'doc-title',
  'doc-description',
  'top-bar',
  'top-bar-text',
  'maintenance-bar',
  'nav-brand',
  'nav-signin',
  'nav-register',
  'hero-badge',
  'hero-title',
  'hero-subtitle',
  'hero-register',
  'hero-secondary',
  'hero-play-pill',
  'hero-store-pill',
  'hero-stats-title',
  'hero-stat-0-value',
  'hero-stat-0-label',
  'hero-stat-1-value',
  'hero-stat-1-label',
  'hero-stat-2-value',
  'hero-stat-2-label',
  'hero-stat-3-value',
  'hero-stat-3-label',
  'how',
  'how-title',
  'how-subtitle',
  'how-steps-grid',
  'features',
  'features-title',
  'features-subtitle',
  'features-grid',
  'recon-title',
  'recon-subtitle',
  'portals',
  'portals-title',
  'portals-grid',
  'app',
  'app-title',
  'app-subtitle',
  'mobile-play-link',
  'mobile-store-link',
  'agencies',
  'agencies-title',
  'agencies-subtitle',
  'pricing',
  'pricing-badge',
  'pricing-title',
  'pricing-subtitle',
  'kh-units',
  'kh-units-label',
  'kh-total-label',
  'kh-rate-note',
  'price-register',
  'faq',
  'faq-title',
  'faq-email',
  'faq-list',
  'cta-title',
  'cta-subtitle',
  'cta-register',
  'cta-talk',
  'footer-brand',
  'footer-tagline',
  'footer-signin',
  'footer-register',
  'footer-email',
  'footer-phone',
  'footer-copyright',
  'year',
];

const presentIds = new Set(
  Array.from(html.matchAll(/\bid="([^"]+)"/g), (m) => m[1]),
);

for (const id of REQUIRED_IDS) {
  if (!presentIds.has(id)) {
    errors.push(`Missing required DOM element id="${id}"`);
  }
}

// 2. Verify all internal #anchor links resolve to an existing id
for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) {
  const targetId = match[1];
  if (targetId && !presentIds.has(targetId)) {
    errors.push(`Broken internal anchor link href="#${targetId}" (no element with id="${targetId}")`);
  }
}

// 3. Syntax-check all inline <script> blocks
const scriptBlocks = Array.from(
  html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
  (m) => m[1],
);

if (scriptBlocks.length === 0) {
  errors.push('Expected at least one inline <script> block in index.html');
}

scriptBlocks.forEach((code, idx) => {
  try {
    new vm.Script(code, { filename: `landing/index.html#script-${idx + 1}` });
  } catch (err) {
    errors.push(
      `Syntax error in <script> block #${idx + 1}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

if (errors.length > 0) {
  console.error('Landing page check failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log(
  `Landing page check passed (${presentIds.size} DOM IDs verified, ${scriptBlocks.length} script block(s) syntax-checked).`,
);
