import type { IncrementRule, Player, Team } from '@/lib/supabase/types';

export function getNextMinBid(
  currentBid: number,
  rules: IncrementRule[],
  granularity: number = 1
): number {
  let next = currentBid + 1;
  for (const rule of rules) {
    if (rule.upTo === null || currentBid < rule.upTo) {
      next = currentBid + rule.step;
      break;
    }
  }

  // Ensure next minimum is aligned with bid_granularity
  if (granularity > 0 && next % granularity !== 0) {
    next = Math.ceil(next / granularity) * granularity;
  }

  return next;
}

export function computeTeamStats(
  team: Team,
  allSoldPlayers: Player[],
  minSquad: number,
  maxSquad: number,
  minBasePrice: number
) {
  const teamSold = allSoldPlayers.filter((p) => p.team_id === team.id && p.status === 'sold');
  const spent = teamSold.reduce((sum, p) => sum + (p.sold_price || 0), 0);
  const purse_remaining = team.purse_total - spent;
  const squad_size = teamSold.length;

  let max_bid = 0;
  if (squad_size >= maxSquad) {
    max_bid = 0;
  } else {
    const slotsNeeded = Math.max(0, minSquad - (squad_size + 1));
    max_bid = purse_remaining - slotsNeeded * minBasePrice;
  }

  return {
    spent,
    purse_remaining,
    squad_size,
    max_bid,
    players: teamSold,
  };
}
