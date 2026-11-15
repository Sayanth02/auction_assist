import { createClient } from '@/lib/supabase/server';
import type { AuctionState, Player, Settings, Team, BidLog, AuctionTeam } from '@/lib/supabase/types';
import { computeTeamStats, getNextMinBid } from '@/lib/auction-rules';
import AuctionConsole from './AuctionConsole';

export default async function AuctionPage() {
  const supabase = await createClient();

  // Fetch all data in parallel
  const [settingsRes, stateRes, teamsRes, playersRes, bidLogRes] = await Promise.all([
    supabase.from('settings').select('*').single(),
    supabase.from('auction_state').select('*').single(),
    supabase.from('teams').select('*').order('name'),
    supabase.from('players').select('*').order('name'),
    supabase.from('bid_log').select('*').order('created_at', { ascending: false }).limit(20),
  ]);

  const settings     = settingsRes.data as Settings;
  const auctionState = stateRes.data as AuctionState;
  const teams        = (teamsRes.data ?? []) as Team[];
  const allPlayers   = (playersRes.data ?? []) as Player[];
  const recentLog    = (bidLogRes.data ?? []) as BidLog[];

  const soldPlayers      = allPlayers.filter((p) => p.status === 'sold');
  const availablePlayers = allPlayers.filter((p) => p.status === 'available');
  const unsoldPlayers    = allPlayers.filter((p) => p.status === 'unsold');

  const currentPlayer = auctionState?.current_player_id
    ? allPlayers.find((p) => p.id === auctionState.current_player_id) ?? null
    : null;

  // Compute minimum next bid, taking into account opening bid at base price & bid_granularity
  const isOpening = auctionState?.status === 'bidding' && auctionState.leading_team_id === null;
  const nextMinBid = auctionState?.status === 'bidding' && auctionState.current_bid != null
    ? (isOpening && (settings?.allow_base_price_bid ?? true)
        ? auctionState.current_bid
        : getNextMinBid(auctionState.current_bid, settings.increment_rules, settings.bid_granularity))
    : null;

  const auctionTeams: AuctionTeam[] = teams.map((team) => {
    const stats = computeTeamStats(team, soldPlayers, settings.min_squad, settings.max_squad, settings.min_base_price);
    return {
      ...team,
      purse_remaining: stats.purse_remaining,
      squad_size: stats.squad_size,
      max_bid: stats.max_bid,
      can_bid: auctionState?.status === 'bidding'
        && stats.max_bid > 0
        && (nextMinBid !== null ? stats.max_bid >= nextMinBid : true),
    };
  });

  // Map player IDs and team IDs to names for the bid log display
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p.name]));
  const teamMap   = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  return (
    <AuctionConsole
      settings={settings}
      auctionState={auctionState}
      currentPlayer={currentPlayer}
      availablePlayers={availablePlayers}
      unsoldPlayers={unsoldPlayers}
      auctionTeams={auctionTeams}
      recentLog={recentLog}
      nextMinBid={nextMinBid}
      playerMap={playerMap}
      teamMap={teamMap}
    />
  );
}
