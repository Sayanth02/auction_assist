/**
 * src/lib/supabase/types.ts
 *
 * Hand-written TypeScript types that mirror the database schema.
 * Run `supabase gen types typescript` later to auto-generate these
 * from the live schema and replace this file.
 */

export type OrderMode = 'manual' | 'random';
export type PlayerStatus = 'available' | 'sold' | 'unsold';
export type AuctionStatus = 'idle' | 'bidding';
export type BidType = 'bid' | 'sold' | 'unsold' | 'undo';

export interface IncrementRule {
  /** bid amounts up to (and including) this value use `step`. null = no upper bound */
  upTo: number | null;
  step: number;
}

export interface Settings {
  id: 1;
  tournament_name: string;
  logo_url: string | null;
  theme_color: string;
  default_purse: number;
  min_squad: number;
  max_squad: number;
  default_base_price: number;
  min_base_price: number;
  increment_rules: IncrementRule[];
  order_mode: OrderMode;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  logo_url: string | null;
  purse_total: number;
  created_at: string;
}

export interface Player {
  id: string;
  name: string;
  position: string | null;
  category: string | null;
  base_price: number;
  photo_url: string | null;
  status: PlayerStatus;
  team_id: string | null;
  sold_price: number | null;
  created_at: string;
}

export interface AuctionState {
  id: 1;
  current_player_id: string | null;
  current_bid: number | null;
  leading_team_id: string | null;
  status: AuctionStatus;
  updated_at: string;
}

export interface BidLog {
  id: string;
  player_id: string;
  team_id: string | null;
  amount: number | null;
  type: BidType;
  created_at: string;
}

/** Computed view of a team enriched with derived fields */
export interface TeamWithStats extends Team {
  /** purse_total minus sum of sold_price for this team's players */
  purse_remaining: number;
  /** number of players currently sold to this team */
  squad_size: number;
}
