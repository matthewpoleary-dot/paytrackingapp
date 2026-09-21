import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, hasSupabaseEnv } from './env';

/** Refresh this far ahead of expiry, so a request never races the deadline. */
const REFRESH_WINDOW_SECONDS = 120;

/**
 * Keeps a session alive, and creates an anonymous one the first time anybody
 * arrives. There is no auth screen — but there is still a real user_id, so
 * every RLS policy is live from the first request, and an anonymous session
 * upgrades to a real account later without migrating a single row.
 *
 * Performance matters here more than anywhere else in the app: this runs
 * before EVERY page, so whatever it does is added to every navigation.
 *
 * Calling auth.getUser() unconditionally — the usual pattern — costs a round
 * trip to Supabase on each one, which measured at 200-500ms and occasionally
 * 3s. So the network call is made only when it changes the outcome: when
 * there is no session at all, or when the one we have is about to expire.
 * Otherwise the cookie is already good and the page can get on with it.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before credentials exist there is no session to keep. The UI still
  // renders so it can be built and reviewed.
  if (!hasSupabaseEnv()) return response;

  const supabase = createServerClient(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Reads the cookie; no network. Enough to answer "is there a session, and
  // how long is it good for" — which is the only question being asked here.
  // It is not used to authorise anything: RLS does that, in Postgres.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    await supabase.auth.signInAnonymously();
    return response;
  }

  const secondsLeft = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
  if (secondsLeft < REFRESH_WINDOW_SECONDS) {
    // Refreshes the token and writes the new cookies through setAll above.
    await supabase.auth.getUser();
  }

  return response;
}
