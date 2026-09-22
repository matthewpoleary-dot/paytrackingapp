import { Screen } from '@/app/_components/ui';
import { Mark } from '@/app/_components/Wordmark';
import { GoogleButton } from './GoogleButton';

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
        <GoogleButton next={next} />

        <p className="t-caption mt-3 text-center text-fg-secondary">
          Nobody else can see your pay.
        </p>
      </div>

      <div className="h-6" />
    </Screen>
  );
}
