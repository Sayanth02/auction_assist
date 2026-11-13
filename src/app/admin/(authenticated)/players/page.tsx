import { createClient } from '@/lib/supabase/server';
import type { Player, Settings, Team } from '@/lib/supabase/types';
import PlayersList from './PlayersList';

export default async function PlayersPage() {
  const supabase = await createClient();

  const [playersRes, settingsRes, teamsRes] = await Promise.all([
    supabase.from('players').select('*').order('created_at', { ascending: true }),
    supabase.from('settings').select('*').eq('id', 1).single(),
    supabase.from('teams').select('*').order('name', { ascending: true }),
  ]);

  const players  = (playersRes.data ?? []) as Player[];
  const settings = settingsRes.data as Settings | null;
  const teams    = (teamsRes.data ?? []) as Team[];

  return <PlayersList players={players} settings={settings} teams={teams} />;
}
