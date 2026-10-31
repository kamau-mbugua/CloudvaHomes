import { BrandLockup } from '../../components/BrandMark';

/**
 * The left-hand brand panel on auth screens — C2.1 "Ledger roof, refined".
 */
const YEAR = new Date().getFullYear();

export function BrandPanel() {
  return (
    <div className="au__brand">
      <div className="au__brandmark">
        <BrandLockup tone="navy" size="md" />
      </div>

      <div className="au__pitch">
        <h1>
          Rent,
          <br />
          <em>collected.</em>
        </h1>
        <p>Invoices, M-Pesa payments and statements for landlords and agencies — in one place.</p>
      </div>

      <div className="au__foot">
        <span className="au__copy">&copy; {YEAR} CloudvaLabs</span>
      </div>
    </div>
  );
}
