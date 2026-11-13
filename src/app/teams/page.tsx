import { createClient } from '@/lib/supabase/server';
import type { Player, Settings, Team } from '@/lib/supabase/types';
import TeamsBoard from './TeamsBoard';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const supabase = await createClient();

  // Parallel initial data fetch
  const [settingsRes, teamsRes, playersRes] = await Promise.all([
    supabase.from('settings').select('*').single(),
    supabase.from('teams').select('*').order('name'),
    supabase.from('players').select('*').order('name'),
  ]);

  const settings = (settingsRes.data || {
    id: 1,
    tournament_name: 'Football Tournament Auction',
    theme_color: '#16a34a',
    default_purse: 100,
    min_squad: 11,
    max_squad: 18,
    default_base_price: 1,
    min_base_price: 1,
    bid_granularity: 1,
    allow_base_price_bid: true,
    increment_rules: [{ upTo: 20, step: 1 }, { upTo: null, step: 2 }],
    order_mode: 'manual',
    logo_url: null,
    updated_at: new Date().toISOString(),
  }) as Settings;

  const teams = (teamsRes.data ?? []) as Team[];
  const players = (playersRes.data ?? []) as Player[];

  return (
    <TeamsBoard
      initialSettings={settings}
      initialTeams={teams}
      initialPlayers={players}
    />
  );
}

