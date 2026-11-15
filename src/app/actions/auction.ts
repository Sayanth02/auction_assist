'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  return supabase;
}

export async function startPlayer(playerId: string): Promise<string | null> {
  try {
    const supabase = await requireAdmin();

    // 1. If player is currently 'unsold', safely restore them to 'available'
    const { data: p } = await supabase
      .from('players')
      .select('id, name, status, base_price')
      .eq('id', playerId)
      .single();

    if (p?.status === 'unsold') {
      await supabase
        .from('players')
        .update({ status: 'available', team_id: null, sold_price: null })
        .eq('id', playerId);
    }

    const { error: rpcError } = await supabase.rpc('start_player', {
      p_player_id: playerId,
    });
    if (!rpcError) {
      revalidatePath('/admin/auction');
      revalidatePath('/admin/players');
      revalidatePath('/display');
      return null;
    }

    console.warn('start_player RPC failed, using direct database fallback:', rpcError.message);

    // Fallback: direct updates if RPC is blocked or encounters safeupdate restriction
    const { data: state, error: stateErr } = await supabase
      .from('auction_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (stateErr || !state) return rpcError.message;
    if (state.status !== 'idle') {
      return `Auction is already running (status: ${state.status})`;
    }

    const basePrice = p?.base_price ?? 1;
    await supabase
      .from('players')
      .update({ status: 'available', team_id: null, sold_price: null })
      .eq('id', playerId);

    await supabase
      .from('auction_state')
      .update({
        current_player_id: playerId,
        current_bid: basePrice,
        leading_team_id: null,
        status: 'bidding',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    revalidatePath('/admin/auction');
    revalidatePath('/admin/players');
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function requeueUnsoldPlayers(): Promise<{ error?: string; count?: number }> {
  try {
    const supabase = await requireAdmin();
    const { data: unsold, error: fetchErr } = await supabase
      .from('players')
      .select('id')
      .eq('status', 'unsold');

    if (fetchErr) return { error: fetchErr.message };
    if (!unsold || unsold.length === 0) return { count: 0 };

    const { error: updateErr } = await supabase
      .from('players')
      .update({ status: 'available', team_id: null, sold_price: null })
      .eq('status', 'unsold');

    if (updateErr) return { error: updateErr.message };

    revalidatePath('/admin/auction');
    revalidatePath('/admin/players');
    revalidatePath('/display');
    return { count: unsold.length };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function placeBid(teamId: string, amount: number): Promise<string | null> {
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc('place_bid', {
      p_team_id: teamId,
      p_amount: amount,
    });
    if (error) return error.message;
    revalidatePath('/admin/auction');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function markSold(): Promise<string | null> {
  try {
    const supabase = await requireAdmin();
    const { error: rpcError } = await supabase.rpc('mark_sold');
    if (!rpcError) {
      revalidatePath('/admin/auction');
      revalidatePath('/admin/players');
      revalidatePath('/admin/teams');
      revalidatePath('/teams');
      revalidatePath('/display');
      return null;
    }

    console.warn('mark_sold RPC failed, using direct database fallback:', rpcError.message);

    // Fallback: direct updates if RPC is blocked by permission or safeupdate
    const { data: state, error: stateErr } = await supabase
      .from('auction_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (stateErr || !state) return rpcError.message;
    if (state.status !== 'bidding') return 'No active auction.';
    if (!state.current_player_id || !state.leading_team_id) {
      return 'No player or leading bid to mark sold.';
    }

    const playerId = state.current_player_id;
    const teamId = state.leading_team_id;
    const soldPrice = state.current_bid ?? 0;

    // 1. Assign player to winning team
    const { error: pErr } = await supabase
      .from('players')
      .update({
        status: 'sold',
        team_id: teamId,
        sold_price: soldPrice,
      })
      .eq('id', playerId);

    if (pErr) return pErr.message;

    // 2. Write log
    await supabase.from('bid_log').insert({
      player_id: playerId,
      team_id: teamId,
      amount: soldPrice,
      type: 'sold',
    });

    // 3. Reset auction state
    await supabase
      .from('auction_state')
      .update({
        current_player_id: null,
        current_bid: null,
        leading_team_id: null,
        status: 'idle',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    revalidatePath('/admin/auction');
    revalidatePath('/admin/players');
    revalidatePath('/admin/teams');
    revalidatePath('/teams');
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function markUnsold(): Promise<string | null> {
  try {
    const supabase = await requireAdmin();
    const { error: rpcError } = await supabase.rpc('mark_unsold');
    if (!rpcError) {
      revalidatePath('/admin/auction');
      revalidatePath('/admin/players');
      revalidatePath('/admin/teams');
      revalidatePath('/teams');
      revalidatePath('/display');
      return null;
    }

    console.warn('mark_unsold RPC failed, using direct database fallback:', rpcError.message);

    const { data: state, error: stateErr } = await supabase
      .from('auction_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (stateErr || !state || !state.current_player_id) {
      return rpcError.message;
    }

    // 1. Mark player as unsold
    const { error: pErr } = await supabase
      .from('players')
      .update({ status: 'unsold' })
      .eq('id', state.current_player_id);

    if (pErr) return pErr.message;

    // 2. Write log
    await supabase.from('bid_log').insert({
      player_id: state.current_player_id,
      team_id: null,
      amount: null,
      type: 'unsold',
    });

    // 3. Reset auction state
    await supabase
      .from('auction_state')
      .update({
        current_player_id: null,
        current_bid: null,
        leading_team_id: null,
        status: 'idle',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    revalidatePath('/admin/auction');
    revalidatePath('/admin/players');
    revalidatePath('/admin/teams');
    revalidatePath('/teams');
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function undoLast(): Promise<string | null> {
  try {
    const supabase = await requireAdmin();

    // 1. Attempt to run via database RPC
    const { error: rpcError } = await supabase.rpc('undo_last');
    if (!rpcError) {
      revalidatePath('/admin/auction');
      revalidatePath('/admin/players');
      revalidatePath('/admin/teams');
      revalidatePath('/teams');
      revalidatePath('/display');
      return null;
    }

    // 2. Fallback in case PostgreSQL raises "safeupdate.enabled" or permission error
    console.warn('undo_last RPC error, falling back to direct server action:', rpcError.message);

    // Fetch the last non-undo log entry
    const { data: lastLogs, error: logErr } = await supabase
      .from('bid_log')
      .select('*')
      .neq('type', 'undo')
      .order('seq_id', { ascending: false })
      .limit(1);

    if (logErr || !lastLogs || lastLogs.length === 0) {
      return 'Nothing to undo.';
    }

    const last = lastLogs[0];

    // Write undo record into bid_log for audit and realtime sync
    await supabase.from('bid_log').insert({
      player_id: last.player_id,
      team_id: last.team_id,
      amount: last.amount,
      type: 'undo',
    });

    if (last.type === 'bid') {
      // Remove the last bid row
      await supabase.from('bid_log').delete().eq('id', last.id);

      // Find the previous bid for this player (if any)
      const { data: prevBids } = await supabase
        .from('bid_log')
        .select('*')
        .eq('player_id', last.player_id)
        .eq('type', 'bid')
        .neq('id', last.id)
        .order('seq_id', { ascending: false })
        .limit(1);

      if (prevBids && prevBids.length > 0) {
        const prev = prevBids[0];
        await supabase
          .from('auction_state')
          .update({
            current_bid: prev.amount,
            leading_team_id: prev.team_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
      } else {
        // No previous bids — restore to player base price, no leader
        const { data: player } = await supabase
          .from('players')
          .select('base_price')
          .eq('id', last.player_id)
          .single();

        await supabase
          .from('auction_state')
          .update({
            current_bid: player?.base_price ?? 1,
            leading_team_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
      }
    } else if (last.type === 'sold') {
      // Remove the sold log row
      await supabase.from('bid_log').delete().eq('id', last.id);

      // Un-sell the player
      await supabase
        .from('players')
        .update({
          status: 'available',
          team_id: null,
          sold_price: null,
        })
        .eq('id', last.player_id);

      // Find the last bid before the sold event for this player
      const { data: prevBids } = await supabase
        .from('bid_log')
        .select('*')
        .eq('player_id', last.player_id)
        .eq('type', 'bid')
        .order('seq_id', { ascending: false })
        .limit(1);

      if (prevBids && prevBids.length > 0) {
        const prev = prevBids[0];
        await supabase
          .from('auction_state')
          .update({
            current_player_id: last.player_id,
            current_bid: prev.amount,
            leading_team_id: prev.team_id,
            status: 'bidding',
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
      } else {
        // No bids before the sold — restore to player base price
        const { data: player } = await supabase
          .from('players')
          .select('base_price')
          .eq('id', last.player_id)
          .single();

        await supabase
          .from('auction_state')
          .update({
            current_player_id: last.player_id,
            current_bid: player?.base_price ?? 1,
            leading_team_id: null,
            status: 'bidding',
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
      }
    } else if (last.type === 'unsold') {
      // Remove the unsold log row
      await supabase.from('bid_log').delete().eq('id', last.id);

      // Mark player available again
      await supabase
        .from('players')
        .update({
          status: 'available',
        })
        .eq('id', last.player_id);

      const { data: prevBids } = await supabase
        .from('bid_log')
        .select('*')
        .eq('player_id', last.player_id)
        .eq('type', 'bid')
        .order('seq_id', { ascending: false })
        .limit(1);

      const { data: player } = await supabase
        .from('players')
        .select('base_price')
        .eq('id', last.player_id)
        .single();

      const basePrice = player?.base_price ?? 1;

      await supabase
        .from('auction_state')
        .update({
          current_player_id: last.player_id,
          current_bid: prevBids && prevBids.length > 0 ? prevBids[0].amount : basePrice,
          leading_team_id: prevBids && prevBids.length > 0 ? prevBids[0].team_id : null,
          status: 'bidding',
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
    }

    revalidatePath('/admin/auction');
    revalidatePath('/admin/players');
    revalidatePath('/admin/teams');
    revalidatePath('/teams');
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function resetAuction(): Promise<string | null> {
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc('reset_auction');
    if (error) return error.message;
    revalidatePath('/admin/auction');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}


