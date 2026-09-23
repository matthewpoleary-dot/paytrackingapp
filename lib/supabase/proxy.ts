import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, hasSupabaseEnv } from './env';

/** Refresh this far ahead of expiry, so a request never races the deadline. */
const REFRESH_WINDOW_SECONDS = 120;

/** Reachable without a session. Everything else redirects to sign-in. */
const PUBLIC_PATHS = ['/signin', '/auth/callback', '/auth/error'];

/**
 * Keeps a session alive and gates the app behind Google sign-in.
 *
 * v1 used an anonymous session so there was never a login wall. That was
 * overturned on 2026-09-21: anonymous is device-bound, and this app now holds
 * 18 months of pay and savings history that must survive a new phone. The RLS
 * half of the original rule is untouched — every table still carries user_id
 * and every policy is still forced.
 *
 * Performance matters here more than anywhere else, because this runs before
 * EVERY page. Calling auth.getUser() unconditionally — the usual pattern —
 * costs a round trip to Supabase each time, measured at 200-500ms and
 * occasionally 3s. The network call is made only when it changes the outcome:
 * when the session is missing or about to expire. Otherwise the cookie is
 * already good and the page can get on with it.
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
  // how long is it good for", which is the only question asked here. It is
  // not used to authorise anything — RLS does that, in Postgres.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // An auth code arriving anywhere other than the callback means Supabase
  // fell back to the Site URL, which it does when the redirect it was handed
  // is not in the project's allow-list. Without this the code is discarded
  // and the user is bounced to /signin — a config error that looks exactly
  // like a broken login, which is how it wasted an evening.
  //
  // Forwarding it is safe: the callback still exchanges it with Supabase, so
  // a bad code fails loudly at /auth/error instead of silently here.
  const authCode = request.nextUrl.searchParams.get('code');
  const authError = request.nextUrl.searchParams.get('error');

  // TEMPORARY INSTRUMENTATION — 2026-09-23, PKCE trace. Remove after.
  if (authCode || authError) {
    console.info('[pkce:B] a code or error arrived', {
      path,
      willForward: !path.startsWith('/auth/'),
      hasCode: Boolean(authCode),
      hasError: Boolean(authError),
    });
  }

  if (!path.startsWith('/auth/') && (authCode || authError)) {
    const target = request.nextUrl.clone();
    if (authError) {
      target.pathname = '/auth/error';
      target.search = `?reason=${encodeURIComponent(
        request.nextUrl.searchParams.get('error_description') ?? authError,
      )}`;
    } else {
      target.pathname = '/auth/callback';
      target.search = `?code=${encodeURIComponent(authCode!)}&next=${encodeURIComponent(path)}`;
    }
    return NextResponse.redirect(target);
  }

  if (!session) {
    if (isPublic) return response;
    const signin = request.nextUrl.clone();
    signin.pathname = '/signin';
    signin.search = '';
    // Where to land once they are back, so a shared link still works.
    if (path !== '/') signin.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(signin);
  }

  // Signed in: the sign-in screen is not somewhere to sit.
  if (path === '/signin') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  const secondsLeft = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
  if (secondsLeft < REFRESH_WINDOW_SECONDS) {
    // Refreshes the token and writes the new cookies through setAll above.
    await supabase.auth.getUser();
  }

  return response;
}
