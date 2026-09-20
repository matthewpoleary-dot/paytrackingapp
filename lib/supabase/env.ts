// One place that reads Supabase config, so a missing variable fails loudly
// at the edge instead of as a confusing 401 three layers in.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_PUBLISHABLE_KEY = () =>
  required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

/**
 * Whether the app is configured to reach Supabase at all.
 *
 * Used only so the UI can be built and screenshotted before credentials
 * exist. It weakens nothing: RLS lives in Postgres, not here, and every
 * write still goes through a real session. Without config there is simply no
 * session, and anything that needs one says so plainly.
 */
export const hasSupabaseEnv = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
