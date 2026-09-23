'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Sign-in, started in the browser.
 *
 * This used to run through a server action, and it failed on the first
 * attempt with "PKCE code verifier not found in storage" while a second
 * attempt succeeded. Measured, the mechanism is this:
 *
 *   attempt 1  cookies before: (none)     -> callback finds no verifier
 *   attempt 2  cookies before: attempt 1's verifier, still there
 *
 * The verifier written during attempt 1 is what makes attempt 2 work, which
 * is why "try again" looked like a fix. The error maps exactly to the cookie
 * being absent — with one present the callback fails differently — so the
 * verifier was not reaching the callback on the first pass.
 *
 * The documented @supabase/ssr pattern is to start OAuth from the browser,
 * where createBrowserClient writes the verifier directly into a cookie that
 * the server callback then reads. Nothing has to survive a server action's
 * response, an external redirect, or a cookie store that silently refuses
 * writes. That removes the class of failure rather than retrying past it.
 *
 * `redirectTo` stays absolute. Supabase does not reject a relative value; it
 * quietly falls back to the project's Site URL, and the code lands on `/`
 * instead of the callback.
 */
export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    // TEMPORARY INSTRUMENTATION — 2026-09-23, PKCE trace. Remove after.
    const jar = () =>
      document.cookie
        .split(';')
        .map((c) => c.trim().split('=')[0])
        .filter(Boolean);
    const before = jar();

    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });

    // TEMPORARY INSTRUMENTATION — the jar at the moment of leaving. Logged
    // synchronously because signInWithOAuth sets location, and anything
    // queued after that may never run.
    const after = jar();
    console.info('[pkce:2] before leaving for Google', {
      before,
      after,
      verifierWritten: after.filter((n) => n.includes('code-verifier')),
      origin: window.location.origin,
      secureContext: window.isSecureContext,
    });

    // Only reached when the redirect never happened; on success the browser
    // has already left.
    if (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="flex min-h-[3.25rem] w-full items-center justify-center gap-3 rounded-xl bg-accent px-5 font-medium text-accent-fg transition-transform duration-150 active:scale-[0.985] disabled:opacity-60"
      >
        <GoogleGlyph />
        {busy ? 'Taking you to Google…' : 'Continue with Google'}
      </button>

      {error && (
        <p role="alert" className="t-caption mt-3 text-critical">
          {error}
        </p>
      )}
    </>
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
