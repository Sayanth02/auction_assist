import { createClient } from '@/lib/supabase/server';
import type { AuctionState, Player, Settings, Team } from '@/lib/supabase/types';
import DisplayScreen from './DisplayScreen';

export const dynamic = 'force-dynamic';

export default async function DisplayPage() {
  const supabase = await createClient();

  // Parallel initial data fetch
  const [settingsRes, stateRes, teamsRes, playersRes, recentSoldRes] = await Promise.all([
    supabase.from('settings').select('*').single(),
    supabase.from('auction_state').select('*').single(),
    supabase.from('teams').select('*').order('name'),
    supabase.from('players').select('*'),
    supabase.from('players').select('*').eq('status', 'sold').order('created_at', { ascending: false }).limit(5),
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

  const auctionState = (stateRes.data || {
    id: 1,
    current_player_id: null,
    current_bid: null,
    leading_team_id: null,
    status: 'idle',
    updated_at: new Date().toISOString(),
  }) as AuctionState;

  const teams = (teamsRes.data ?? []) as Team[];
  const allPlayers = (playersRes.data ?? []) as Player[];

  const currentPlayer = auctionState.current_player_id
    ? allPlayers.find((p) => p.id === auctionState.current_player_id) ?? null
    : null;

  const leadingTeam = auctionState.leading_team_id
    ? teams.find((t) => t.id === auctionState.leading_team_id) ?? null
    : null;

  // Enrich recently sold players with their team names
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const recentSold = ((recentSoldRes.data ?? []) as Player[]).map((p) => ({
    ...p,
    teamName: p.team_id ? teamMap.get(p.team_id) : undefined,
  }));

  return (
    <DisplayScreen
      initialSettings={settings}
      initialAuctionState={auctionState}
      initialCurrentPlayer={currentPlayer}
      initialLeadingTeam={leadingTeam}
      initialTeams={teams}
      initialPlayers={allPlayers}
      initialRecentSold={recentSold}
    />
  );
}

