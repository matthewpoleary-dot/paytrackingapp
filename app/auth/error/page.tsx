import Link from 'next/link';
import { Card, Screen } from '@/app/_components/ui';

/**
 * Hints, matched to the reason actually returned.
 *
 * This page used to headline "Sign-in is limited to TCD accounts" whatever
 * had gone wrong, which sent hours of debugging at a restriction that was
 * not the problem and no longer exists. A hint that does not match its
 * reason code is worse than no hint, so there is no default one: an
 * unrecognised reason shows the reason and nothing else.
 */
const HINTS: { match: RegExp; hint: string }[] = [
  {
    match: /code verifier|pkce/i,
    hint: 'Sign-in was started in a different browser, or the tab was open long enough for it to expire. Starting again from this browser should work.',
  },
  {
    match: /access_denied|cancell?ed/i,
    hint: 'The Google consent screen was dismissed before it finished.',
  },
  {
    match: /no-code/i,
    hint: 'Google sent you back without an authorisation code. That usually means this address is missing from the project’s Redirect URLs.',
  },
  {
    match: /redirect|uri mismatch/i,
    hint: 'The address Google was told to return to is not on the allow-list for this project.',
  },
  {
    match: /rate limit|too many/i,
    hint: 'Too many attempts in a short window. Waiting a minute clears it.',
  },
  {
    match: /expired|invalid.*token/i,
    hint: 'The one-time code had already been used or had expired. Codes only work once.',
  },
];

export default async function AuthErrorPage(props: PageProps<'/auth/error'>) {
  const params = await props.searchParams;
  const reason = typeof params.reason === 'string' && params.reason.trim() ? params.reason : null;
  const hint = reason ? HINTS.find((h) => h.match.test(reason))?.hint : undefined;

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="t-title">Couldn&rsquo;t sign you in</h1>

        {/* The real reason leads. Whatever the flow actually returned is the
            only thing on this screen that is reliably true. */}
        <Card className="mt-4 px-5 py-4">
          <p className="t-body break-words">{reason ?? 'No reason was reported.'}</p>
          {hint && <p className="t-caption mt-3 text-fg-secondary">{hint}</p>}
        </Card>

        <Link
          href="/signin"
          className="mt-4 flex min-h-[3.25rem] w-full items-center justify-center rounded-xl bg-accent font-medium text-accent-fg"
        >
          Try again
        </Link>
      </div>
    </Screen>
  );
}
