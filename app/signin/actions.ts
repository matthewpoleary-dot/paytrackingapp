'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Starts the Google flow.
 *
 * The consent screen is Internal to the TCD Workspace, so only @tcd.ie
 * accounts can get through it — the restriction lives in Google Cloud rather
 * than in a check here, which is the right place for it.
 */
/**
 * Where Supabase must send the browser back to.
 *
 * This has to be absolute. A relative value is not rejected — Supabase
 * quietly falls back to the project's Site URL, so the code lands on `/`
 * instead of the callback and the failure looks like a broken login rather
 * than a missing header. `origin` is present on a form POST, but the `?? ''`
 * that used to be here turned its absence into exactly that silent fallback,
 * so the fallbacks are explicit and the dead end throws.
 */
async function resolveOrigin(): Promise<string> {
  const h = await headers();

  const origin = h.get('origin');
  if (origin) return origin;

  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  throw new Error('Cannot determine the request origin, so the OAuth redirect would be relative.');
}

export async function signInWithGoogle(formData: FormData) {
  const nextPath = String(formData.get('next') ?? '/');
  const origin = await resolveOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });

  if (error || !data.url) {
    redirect(`/auth/error?reason=${encodeURIComponent(error?.message ?? 'no-url')}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/signin');
}
