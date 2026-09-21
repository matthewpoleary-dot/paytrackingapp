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
export async function signInWithGoogle(formData: FormData) {
  const nextPath = String(formData.get('next') ?? '/');
  const origin = (await headers()).get('origin') ?? '';

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
