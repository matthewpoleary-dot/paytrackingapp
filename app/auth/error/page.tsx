import Link from 'next/link';
import { Card, Screen } from '@/app/_components/ui';

export default async function AuthErrorPage(props: PageProps<'/auth/error'>) {
  const params = await props.searchParams;
  const reason = typeof params.reason === 'string' ? params.reason : 'Unknown';

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="t-title">Couldn&rsquo;t sign you in</h1>
        <Card className="mt-4 px-5 py-4">
          <p className="t-caption text-fg-secondary">
            Sign-in is limited to TCD accounts. If you used a personal Google account,
            try again with your college one.
          </p>
          <p className="t-caption mt-3 break-words text-fg-tertiary">{reason}</p>
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
