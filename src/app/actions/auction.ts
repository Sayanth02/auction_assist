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
    const { error } = await supabase.rpc('start_player', {
      p_player_id: playerId,
    });
    if (error) return error.message;
    revalidatePath('/admin/auction');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
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
    const { error } = await supabase.rpc('mark_sold');
    if (error) return error.message;
    revalidatePath('/admin/auction');
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

