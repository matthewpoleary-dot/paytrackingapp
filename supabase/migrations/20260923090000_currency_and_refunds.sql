-- ---------------------------------------------------------------------------
-- Currency on transactions, and a refund category.
--
-- Two findings from the 2026-09-23 audit of the budget layer.
--
-- CURRENCY. Non-EUR rows were skipped at import with a reason. Safe, but it
-- meant that from January, in Montreal, every local transaction would be
-- absent and the budget would go blind exactly when it mattered most. Data
-- not captured is unrecoverable; a total that has to wait is merely late.
--
-- So the native amount is stored with the currency it was in, and nothing is
-- converted. Euro totals stay euro-only and the UI says how many rows were
-- left out. FX conversion is a separate decision needing its own rate-and-
-- date discipline, exactly as docs/PAY-RULES.md demands of any outside
-- figure — inventing a rate here would be the same failure as inventing a
-- pay rule.
--
-- REFUND. Every positive amount was categorised 'income', so an €80 purchase
-- refunded for €60 reported €80 of spending and €60 of income — wrong in
-- both directions, with the original never offset. A refund the importer can
-- match to its purchase now takes that purchase's category and nets off
-- there. One it cannot match lands here, and is excluded from spending AND
-- income rather than guessed into either.
-- ---------------------------------------------------------------------------

alter type public.spend_category add value if not exists 'refund';

alter table public.txn
  add column if not exists currency text not null default 'EUR'
    check (currency ~ '^[A-Z]{3}$');

comment on column public.txn.currency is
  'ISO 4217, as the statement gave it. amount_cents is the NATIVE amount and '
  'is never converted. Non-EUR rows are captured but excluded from euro '
  'totals until a rate policy exists.';

-- The importer's key now carries the currency and a per-file ordinal, so two
-- identical rows in one statement survive as two. The index itself is
-- unchanged; this note records why its input changed shape.
comment on index public.txn_external_once is
  'Idempotency for re-import. external_id is date|description|amount|currency|'
  'ordinal — the ordinal is load-bearing, because Revolut exports carry no '
  'transaction id and two identical coffees on one day would otherwise hash '
  'the same and the second would be dropped as a duplicate.';
