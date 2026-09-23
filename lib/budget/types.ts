// Domain types mirroring supabase/migrations/20260921120000_*.sql.

export type LineConfidence = 'quoted' | 'researched' | 'guess';

export type OutgoingCadence = 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export type TxnSource = 'manual' | 'revolut_csv';

export type CategorisedBy = 'user' | 'model';

export type FactSource = 'user' | 'model';

/**
 * A closed vocabulary. The model targets these and nothing else — an open
 * text field would let it invent a new category every week and make spending
 * by category meaningless.
 */
export type SpendCategory =
  | 'groceries'
  | 'eating_out'
  | 'transport'
  | 'rent'
  | 'bills'
  | 'health'
  | 'education'
  | 'shopping'
  | 'entertainment'
  | 'travel'
  | 'fees'
  | 'income'
  | 'transfer'
  | 'refund'
  | 'other';

export const SPEND_CATEGORIES: readonly SpendCategory[] = [
  'groceries',
  'eating_out',
  'transport',
  'rent',
  'bills',
  'health',
  'education',
  'shopping',
  'entertainment',
  'travel',
  'fees',
  'income',
  'transfer',
  'refund',
  'other',
];

export const CATEGORY_LABEL: Record<SpendCategory, string> = {
  groceries: 'Groceries',
  eating_out: 'Eating out',
  transport: 'Transport',
  rent: 'Rent',
  bills: 'Bills',
  health: 'Health',
  education: 'Education',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  travel: 'Travel',
  fees: 'Fees',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
  other: 'Other',
};

/**
 * Categories that are not spending.
 *
 * `transfer` is money moved to savings — counting it as spent would make
 * every good month look like a bad one. `income` is the mirror image: wages
 * landing are not a negative expense.
 *
 * `refund` is a refund the importer could not match to its purchase. It is
 * excluded from BOTH, deliberately: calling it income overstates earnings,
 * and there is no purchase here to reduce. A matched refund never reaches
 * this list — it takes the original purchase's category and nets off there.
 */
export const NON_SPEND: readonly SpendCategory[] = ['transfer', 'income', 'refund'];

export function isSpending(category: SpendCategory): boolean {
  return !NON_SPEND.includes(category);
}

export interface GoalLine {
  id: string;
  goal_id: string;
  label: string;
  amount_cents: number;
  confidence: LineConfidence;
  source_url: string | null;
  source_checked_on: string | null;
  sort_order: number;
}

export interface Outgoing {
  id: string;
  label: string;
  amount_cents: number;
  cadence: OutgoingCadence;
  category: SpendCategory;
  started_on: string;
  ended_on: string | null;
}

export interface Txn {
  id: string;
  posted_on: string;
  description: string;
  /**
   * Signed: negative is money out, positive is money in. This is the NATIVE
   * amount in `currency` and is never converted.
   */
  amount_cents: number;
  /**
   * ISO 4217. Non-EUR rows are captured so the record is complete, and kept
   * out of euro totals until there is a rate policy with a date on it.
   */
  currency: string;
  category: SpendCategory;
  categorised_by: CategorisedBy;
  source: TxnSource;
  external_id: string | null;
}

export interface ProfileFact {
  id: string;
  key: string;
  value: string;
  learned_on: string;
  confirmed_at: string | null;
  source: FactSource;
}
