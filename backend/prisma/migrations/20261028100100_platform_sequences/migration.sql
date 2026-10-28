-- Platform-wide numbering (not per organisation): billing account numbers and Hodi invoices.
CREATE SEQUENCE IF NOT EXISTS "billing_ref_seq";
SELECT setval('"billing_ref_seq"', GREATEST(1, (SELECT count(*) FROM "organizations")), (SELECT count(*) FROM "organizations") > 0);
CREATE SEQUENCE IF NOT EXISTS "platform_invoice_seq";
