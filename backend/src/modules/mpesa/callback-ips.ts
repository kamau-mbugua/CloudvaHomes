/**
 * Safaricom's published Daraja callback source addresses. Confirm against the current Daraja
 * documentation before go-live and override with MPESA_CALLBACK_IPS when they change.
 */
export const SAFARICOM_CALLBACK_IPS = [
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.212.127',
  '196.201.212.138',
  '196.201.212.129',
  '196.201.212.136',
  '196.201.212.74',
  '196.201.212.69',
];

/** Exact match after stripping the IPv4-mapped IPv6 prefix ("::ffff:1.2.3.4"). */
export function ipAllowed(ip: string | undefined, allowed: readonly string[]): boolean {
  if (!ip) return false;
  const plain = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return allowed.includes(plain) || allowed.includes(ip);
}
