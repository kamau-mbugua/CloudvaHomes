/**
 * The left-hand brand panel on auth screens — ported from pos-react's BrandPanel.
 *
 * Deliberately quiet: wordmark, one headline, one line of copy. The panel sits beside a
 * form whose whole job is one decision. Decorative — hidden below 900px, where a compact
 * brand row in the form panel's header takes over.
 */
// Read once at module load, not during render.
const YEAR = new Date().getFullYear();

export function BrandPanel() {
  return (
    <div className="au__brand">
      <div className="au__brandmark">
        <img className="au__logo" src="/favicon.svg" alt="" aria-hidden="true" />
        <span className="au__wordmark">Hodi</span>
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
