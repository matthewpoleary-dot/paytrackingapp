import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, hasSupabaseEnv } from './env';

// Refreshes the session cookie on every request, and creates an anonymous
// one the first time somebody arrives. There is no auth screen in v1 — but
// there is still a real user_id, so every RLS policy is live from the first
// request. An anonymous session upgrades to a real account later without
// migrating a single row.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before credentials exist there is no session to keep. The UI still
  // renders so it can be built and reviewed; anything needing a session says
  // so plainly rather than 500ing every route.
  if (!hasSupabaseEnv()) return response;

  const supabase = createServerClient(
    SUPABASE_URL(),
    SUPABASE_PUBLISHABLE_KEY(),
    {
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
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signInAnonymously();
  }

  return response;
}
