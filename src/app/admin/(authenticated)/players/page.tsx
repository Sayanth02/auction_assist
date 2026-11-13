import { createClient } from '@/lib/supabase/server';
import type { Player, Settings } from '@/lib/supabase/types';
import PlayersList from './PlayersList';

export default async function PlayersPage() {
  const supabase = await createClient();

  const [playersRes, settingsRes] = await Promise.all([
    supabase.from('players').select('*').order('created_at', { ascending: true }),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);

  const players  = (playersRes.data ?? []) as Player[];
  const settings = settingsRes.data as Settings | null;

  return <PlayersList players={players} settings={settings} />;
}
