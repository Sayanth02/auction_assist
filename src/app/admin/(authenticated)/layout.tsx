import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminShell from './AdminShell';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/admin/login');

  const { data: settings } = await supabase
    .from('settings')
    .select('tournament_name, logo_url')
    .single();

  return (
    <AdminShell
      tournamentName={settings?.tournament_name}
      logoUrl={settings?.logo_url}
    >
      {children}
    </AdminShell>
  );
}
