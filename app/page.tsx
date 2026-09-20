import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';

// No login wall: the first thing anyone sees is the first question, and the
// session behind it was created silently by the proxy.
export default async function Home() {
  if (!hasSupabaseEnv()) redirect('/setup');

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('settings')
    .select('id')
    .maybeSingle();

  if (!settings) redirect('/setup');

  // Step 6 lands here.
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <h1 className="t-title">This period</h1>
    </main>
  );
}
