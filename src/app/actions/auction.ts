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

    const { error } = await supabase.rpc('start_player', {
      p_player_id: playerId,
    });
    if (error) return error.message;

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
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function markSold(): Promise<string | null> {
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc('mark_sold');
    if (error) return error.message;

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
    const { error } = await supabase.rpc('mark_unsold');
    if (error) return error.message;

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
    const { error } = await supabase.rpc('undo_last');
    if (error) return error.message;

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
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}


