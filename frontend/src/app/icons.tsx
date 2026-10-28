/**
 * Sidebar and top-bar icons — the same 24×24, 1.6-stroke Tabler-style set pos-react uses
 * (src/components/shell/icons.tsx), inline so there is no icon library. Unsized: the
 * caller's CSS sets width and height.
 */
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function HomeIcon() {
  return <Icon><path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M10 12h4v4h-4z" /></Icon>;
}

/** A key — landlords own the keys. */
export function KeyIcon() {
  return <Icon><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" /><path d="M15 9h.01" /></Icon>;
}

export function BuildingIcon() {
  return <Icon><path d="M3 21l18 0" /><path d="M9 8l1 0" /><path d="M9 12l1 0" /><path d="M9 16l1 0" /><path d="M14 8l1 0" /><path d="M14 12l1 0" /><path d="M14 16l1 0" /><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16" /></Icon>;
}

export function PeopleIcon() {
  return <Icon><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
}

export function InvoiceIcon() {
  return <Icon><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 9l1 0" /><path d="M9 13l6 0" /><path d="M9 17l6 0" /></Icon>;
}

export function CashIcon() {
  return <Icon><path d="M7 9m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M14 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 9v-2a2 2 0 0 0 -2 -2h-10a2 2 0 0 0 -2 2v6a2 2 0 0 0 2 2h2" /></Icon>;
}

export function ReceiptIcon() {
  return <Icon><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" /><path d="M14 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5m2 0v1.5m0 -9v1.5" /></Icon>;
}

export function ChartIcon() {
  return <Icon><path d="M4 19v-10" /><path d="M9 19v-14" /><path d="M14 19v-7" /><path d="M19 19v-11" /></Icon>;
}

export function CogIcon() {
  return <Icon><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></Icon>;
}

export function SunIcon() {
  return <Icon><path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4" /></Icon>;
}

export function MoonIcon() {
  return <Icon><path d="M20 14.5a8.5 8.5 0 0 1 -10.5 -10.5a8.5 8.5 0 1 0 10.5 10.5z" /></Icon>;
}

export function MenuIcon() {
  return <Icon><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
}

export function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return <Icon><path d={direction === 'left' ? 'M15 6l-6 6l6 6' : 'M9 6l6 6l-6 6'} /></Icon>;
}

export function SignOutIcon() {
  return <Icon><path d="M15 17l5 -5l-5 -5" /><path d="M20 12h-11" /><path d="M12 20h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h6" /></Icon>;
}

export function PersonIcon() {
  return <Icon><path d="M12 8m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0" /><path d="M5 20c0 -3.5 3.1 -5.5 7 -5.5s7 2 7 5.5" /></Icon>;
}

export function CheckIcon() {
  return <Icon><path d="M5 12l5 5l10 -10" /></Icon>;
}

/** Two arrows — switch organisation. */
export function SwitchIcon() {
  return <Icon><path d="M7 4l-3 3l3 3" /><path d="M4 7h16" /><path d="M17 20l3 -3l-3 -3" /><path d="M20 17h-16" /></Icon>;
}

/** A shield — the platform admin area. */
export function ShieldIcon() {
  return <Icon><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></Icon>;
}
