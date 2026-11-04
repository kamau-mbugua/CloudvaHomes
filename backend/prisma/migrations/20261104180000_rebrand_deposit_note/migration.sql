-- Hodi is now KodiHub: rename the automatic note on opening deposit entries (tenants and
-- staff see it in the deposit history). Notes typed by people are left as they are.
UPDATE "deposit_transactions"
   SET "note" = 'Deposit held before KodiHub'
 WHERE "kind" = 'OPENING' AND "note" = 'Deposit held before Hodi';
