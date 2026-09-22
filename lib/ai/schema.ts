import type { ToolSpec } from './types';
import { SPEND_CATEGORIES } from '@/lib/budget/types';

/**
 * The tool declarations.
 *
 * Data, deliberately separated from the handlers in ./tools.ts. Those reach
 * the database and therefore only load inside a request; these are a plain
 * array, so tests/ai.test.mjs can check that every one of them survives
 * translation to the provider's schema without standing up Next or Supabase.
 *
 * That check matters more than it looks: an unsupported key anywhere in a
 * declaration makes the provider reject the whole request, and the visible
 * symptom is the model answering from memory because it was handed no tools.
 */

const ISO_DATE = { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

export const TOOLS: ToolSpec[] = [
  {
    name: 'get_pay_snapshot',
    description:
      'What the user earned or is rostered to earn between two dates. Returns computed totals from the shift log — always use this rather than adding up shifts yourself. Figures are estimated until the user confirms their actual finish times.',
    input_schema: {
      type: 'object',
      properties: {
        from: { ...ISO_DATE, description: 'First day, inclusive (Dublin date).' },
        to: { ...ISO_DATE, description: 'Last day, inclusive (Dublin date).' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_upcoming_shifts',
    description:
      'Shifts already rostered from today onwards, with what each is worth. Use for questions about what is coming in.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'integer',
          minimum: 1,
          maximum: 120,
          description: 'How far forward to look. 28 is a sensible default.',
        },
      },
      required: ['days_ahead'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_goal',
    description:
      'The savings goal: its cost breakdown line by line with each line\'s confidence, how much has been set aside, and when it will be reached at the current rate. The target is the SUM of the lines — never state a target you worked out yourself.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_spending',
    description:
      'Spending by category between two dates, computed from the transaction log. Transfers to savings and incoming wages are excluded, because neither is spending.',
    input_schema: {
      type: 'object',
      properties: {
        from: { ...ISO_DATE, description: 'First day, inclusive.' },
        to: { ...ISO_DATE, description: 'Last day, inclusive.' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_outgoings',
    description:
      'Recurring committed money out, each normalised to a weekly figure so different cadences can be compared.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_cashflow',
    description:
      'The figure tying earnings, commitments and spending together for a window, and what it leaves per week. This is what a savings rate should be based on.',
    input_schema: {
      type: 'object',
      properties: {
        from: { ...ISO_DATE, description: 'First day, inclusive.' },
        to: { ...ISO_DATE, description: 'Last day, inclusive.' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_profile_facts',
    description:
      'Durable facts the user has confirmed or the model has proposed about them — destination, departure month, rent, the buffer they will not dip below. Check here before asking something they have already answered.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },

  // --- Propose-only. These write nothing. ----------------------------------
  {
    name: 'propose_goal_line',
    description:
      'Propose a line for the goal breakdown. Returns a card for the user to tap; it does NOT save. A figure about the outside world must carry the URL you found it at and the date you checked, and be confidence "researched". Without a source it is a "guess" and must say so.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', maxLength: 80, description: 'Short name, e.g. "Flights".' },
        amount_cents: { type: 'integer', minimum: 1, description: 'Integer cents, never euro.' },
        confidence: {
          type: 'string',
          enum: ['quoted', 'researched', 'guess'],
          description:
            '"quoted" only if the user has an actual booking. "researched" requires a source. Otherwise "guess".',
        },
        source_url: {
          type: ['string', 'null'],
          description: 'Required when confidence is "researched".',
        },
        source_checked_on: {
          type: ['string', 'null'],
          description: 'Date you checked the source, YYYY-MM-DD. Required when "researched".',
        },
        reasoning: { type: 'string', maxLength: 300, description: 'One line: why this figure.' },
      },
      required: ['label', 'amount_cents', 'confidence', 'source_url', 'source_checked_on', 'reasoning'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_outgoing',
    description:
      'Propose a recurring outgoing. Returns a card for the user to tap; it does NOT save.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', maxLength: 80 },
        amount_cents: { type: 'integer', minimum: 1 },
        cadence: { type: 'string', enum: ['weekly', 'fortnightly', 'monthly', 'yearly'] },
        category: { type: 'string', enum: [...SPEND_CATEGORIES] },
        started_on: ISO_DATE,
        reasoning: { type: 'string', maxLength: 300 },
      },
      required: ['label', 'amount_cents', 'cadence', 'category', 'started_on', 'reasoning'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_profile_fact',
    description:
      'Propose remembering something durable about the user. Returns a card for the user to tap; it does NOT save. Use short stable keys like "destination", "departure_month", "monthly_rent", "minimum_buffer".',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', maxLength: 60 },
        value: { type: 'string', maxLength: 500 },
        reasoning: { type: 'string', maxLength: 300 },
      },
      required: ['key', 'value', 'reasoning'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_txn_category',
    description:
      'Propose recategorising a transaction. Returns a card for the user to tap; it does NOT save.',
    input_schema: {
      type: 'object',
      properties: {
        txn_id: { type: 'string' },
        category: { type: 'string', enum: [...SPEND_CATEGORIES] },
        reasoning: { type: 'string', maxLength: 300 },
      },
      required: ['txn_id', 'category', 'reasoning'],
      additionalProperties: false,
    },
  },
];
