import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Where Google sends the user back to.
 *
 * Exchanges the one-time code for a session and writes the cookies. The
 * `next` parameter is validated as a relative path before it is followed —
 * an open redirect here would let a crafted link bounce a freshly
 * authenticated user to somebody else's site.
 */
export async function GET(request: NextRequest) {
  // TEMPORARY INSTRUMENTATION — 2026-09-23, PKCE trace. Remove after.
  // The entire inbound Cookie header, before any Supabase client touches it.
  {
    const raw = request.headers.get('cookie') ?? '';
    const names = raw
      .split(';')
      .map((c) => c.trim().split('=')[0])
      .filter(Boolean);
    console.info('[pkce:3] callback inbound', {
      url: request.nextUrl.pathname + request.nextUrl.search.slice(0, 80),
      referer: request.headers.get('referer'),
      cookieHeaderBytes: raw.length,
      cookieNames: names,
      verifierPresent: names.some((n) => n.includes('code-verifier')),
      verifierNames: names.filter((n) => n.includes('code-verifier')),
    });
  }

  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=no-code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error.message.slice(0, 120))}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
