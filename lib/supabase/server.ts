import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          // A Server Component cannot write cookies, and the proxy refreshes
          // the session anyway, so that case is genuinely fine.
          //
          // It is not fine silently. This catch also swallows a failed write
          // from a route handler or a server action, where the cookie was
          // load-bearing — and a dropped auth cookie with no error, no log
          // and no trace is a bug that can only be found by guessing. It was
          // the first suspect for a PKCE failure it turned out not to have
          // caused, which cost the time anyway.
          console.warn(
            '[supabase] could not write cookies:',
            cookiesToSet.map((c) => c.name).join(', '),
            error instanceof Error ? error.message : error,
          );
        }
      },
    },
  });
}
