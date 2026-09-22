'use server';

// Sign-IN is not here any more. It runs in the browser, from
// app/signin/GoogleButton.tsx, because the PKCE verifier has to be written
// by the client that will later read it — starting the flow from a server
// action left the verifier behind on the first attempt and made "try again"
// look like a fix. See that file for the measurements.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/signin');
}
