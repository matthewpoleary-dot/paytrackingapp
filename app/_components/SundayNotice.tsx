import Link from 'next/link';

/**
 * The s.14 flag.
 *
 * The substance is the most defensible thing in the app — it is the whole
 * reason settings.sunday_premium_kind stores null distinctly from 'none', so
 * "I don't know" can be told apart from "no". None of that changes here.
 *
 * The writing does. It ran four lines, opened on a statute number, and ended
 * on "Worth checking your contract", which is the sound of a paragraph that
 * could not decide what to ask for. Someone reading this wants to know
 * whether they are owed money, not to be taught the Organisation of Working
 * Time Act.
 *
 * So: two lines saying what happened and what it might mean, the law behind a
 * disclosure for whoever wants it, and a real button instead of an underlined
 * phrase trailing a paragraph.
 *
 * <details> rather than state, because it costs no JavaScript and arrives
 * keyboard-accessible and announced without any work.
 */
export function SundayNotice() {
  return (
    <section className="px-1">
      <h2 className="t-heading">You worked a Sunday</h2>
      <p className="t-body mt-1.5 max-w-[46ch] text-fg-secondary">
        Nothing extra was added, because no Sunday rate is set. Your contract may
        owe you one.
      </p>

      <details className="group mt-2">
        <summary className="t-caption inline-flex min-h-11 cursor-pointer list-none items-center text-fg-secondary underline [&::-webkit-details-marker]:hidden">
          Why might it?
        </summary>
        <p className="t-caption max-w-[52ch] pb-1 text-fg-secondary">
          Section 14 of the Organisation of Working Time Act 1997 entitles you to
          compensation for Sunday work — a premium, extra time off, or a rate that
          already accounts for it. Many hospitality contracts take the last route,
          in which case nothing further is owed.
        </p>
      </details>

      <Link
        href="/settings"
        className="mt-2 inline-flex min-h-[3.25rem] items-center justify-center rounded-xl border border-border px-5 font-medium text-fg"
      >
        Set a Sunday rate
      </Link>
    </section>
  );
}
