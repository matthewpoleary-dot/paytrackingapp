import { Screen } from '@/app/_components/ui';
import { Mark } from '@/app/_components/Wordmark';
import { signInWithGoogle } from './actions';

/**
 * The sign-in wall.
 *
 * v1's rule was "no login wall before the first number appears"; that was
 * overturned on 2026-09-21 because anonymous sessions are device-bound and
 * this app now holds 18 months of history. The four-second bar still governs
 * everything behind this screen — so the screen itself is one button and no
 * decisions.
 */
export default async function SignInPage(props: PageProps<'/signin'>) {
  const params = await props.searchParams;
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/';

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Mark size={56} />
        <h1 className="t-title mt-5">Tally</h1>
        <p className="t-body mt-2 max-w-[24ch] text-balance text-fg-secondary">
          Your shifts, what they&rsquo;re worth, and what you&rsquo;re putting aside.
        </p>
      </div>

      <div className="pb-2">
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="flex min-h-[3.25rem] w-full items-center justify-center gap-3 rounded-xl bg-accent px-5 font-medium text-accent-fg transition-transform duration-150 active:scale-[0.985]"
          >
            <GoogleGlyph />
            Continue with Google
          </button>
        </form>

        <p className="t-caption mt-3 text-center text-fg-secondary">
          Nobody else can see your pay.
        </p>
      </div>

      <div className="h-6" />
    </Screen>
  );
}

/** Google's mark, in its own colours — the one place brand colour is allowed. */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37.0 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
