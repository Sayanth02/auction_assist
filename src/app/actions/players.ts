'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  POSITION_OPTIONS,
  CATEGORY_OPTIONS,
  DEFAULT_POSITION,
  normalizePositionCode,
  normalizeCategory,
} from '@/lib/player-constants';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  return supabase;
}

function getStoragePath(url: string | null | undefined, bucket: string = 'branding'): string | null {
  if (!url) return null;
  try {
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(url.substring(idx + marker.length));
    }
    return null;
  } catch {
    return null;
  }
}

export async function upsertPlayer(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const supabase = await requireAdmin().catch((e) => { throw e; });

  const id           = (formData.get('id') as string | null) || undefined;
  const name         = ((formData.get('name') as string) || '').trim();
  const rawPosition  = ((formData.get('position') as string) || '').trim();
  const rawCategory  = ((formData.get('category') as string) || '').trim();
  const base_price   = Number(formData.get('base_price'));
  const removePhoto  = formData.get('remove_photo') === 'true';
  const photoFile    = formData.get('photo_file');

  // Fetch settings for granularity & min base price validation
  const { data: settings } = await supabase
    .from('settings')
    .select('bid_granularity, min_base_price')
    .eq('id', 1)
    .single();

  const granularity = settings?.bid_granularity ?? 1;
  const minBasePrice = settings?.min_base_price ?? 0;

  // 1. Name validation
  if (!name) {
    return 'Player name is required.';
  }

  // 2. Position validation & normalization to short code (defaults to NS)
  const position = normalizePositionCode(rawPosition) || DEFAULT_POSITION;

  // 3. Category validation (required, no default)
  if (!rawCategory) {
    return 'Player category is required. Please select one.';
  }
  const category = normalizeCategory(rawCategory);
  if (!category) {
    return `Invalid category. Must be one of: ${CATEGORY_OPTIONS.join(', ')}`;
  }

  // 4. Base price validation
  if (isNaN(base_price) || base_price < 0) {
    return 'Base price must be a valid non-negative number.';
  }
  if (base_price < minBasePrice) {
    return `Base price cannot be lower than the tournament minimum of ₹${minBasePrice}.`;
  }
  if (granularity > 0 && base_price % granularity !== 0) {
    return `Base price ₹${base_price} must be a multiple of bid granularity (₹${granularity}).`;
  }

  // 5. Existing photo URL lookup (if editing)
  let oldPhotoUrl: string | null = null;
  if (id) {
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('photo_url')
      .eq('id', id)
      .single();
    oldPhotoUrl = existingPlayer?.photo_url ?? null;
  }

  let photo_url: string | null = oldPhotoUrl;

  // 6. Handle photo removal or upload to public Supabase bucket 'branding' in 'players/' folder
  if (removePhoto) {
    if (oldPhotoUrl) {
      const oldPath = getStoragePath(oldPhotoUrl, 'branding');
      if (oldPath) {
        await supabase.storage.from('branding').remove([oldPath]);
      }
    }
    photo_url = null;
  } else if (photoFile && typeof photoFile === 'object' && 'size' in photoFile && (photoFile as File).size > 0) {
    const file = photoFile as File;
    const timestamp = Date.now();
    const rawName = file.name.includes('.')
      ? file.name.substring(0, file.name.lastIndexOf('.'))
      : file.name;
    const baseName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const fileName = `players/${timestamp}-${baseName}.webp`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('branding')
      .upload(fileName, fileBuffer, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      return `Failed to upload photo: ${uploadError.message}`;
    }

    const { data: publicUrlData } = supabase.storage
      .from('branding')
      .getPublicUrl(fileName);

    photo_url = publicUrlData.publicUrl;

    // Delete old photo if replaced
    if (oldPhotoUrl && oldPhotoUrl !== photo_url) {
      const oldPath = getStoragePath(oldPhotoUrl, 'branding');
      if (oldPath) {
        await supabase.storage.from('branding').remove([oldPath]);
      }
    }
  }

  const payload = {
    name,
    position,
    category,
    base_price,
    photo_url,
  };

  const { error } = id
    ? await supabase.from('players').update(payload).eq('id', id)
    : await supabase.from('players').insert(payload);

  if (error) return error.message;

  revalidatePath('/admin/players');
  revalidatePath('/admin/auction');
  revalidatePath('/display');
  revalidatePath('/teams');
  return null;
}

export async function deletePlayer(playerId: string): Promise<string | null> {
  const supabase = await requireAdmin().catch((e) => { throw e; });

  // 1. Fetch player's photo_url to clean up from storage
  const { data: player } = await supabase
    .from('players')
    .select('photo_url')
    .eq('id', playerId)
    .single();

  if (player?.photo_url) {
    const oldPath = getStoragePath(player.photo_url, 'branding');
    if (oldPath) {
      await supabase.storage.from('branding').remove([oldPath]);
    }
  }

  // 2. Delete player record
  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) return error.message;

  revalidatePath('/admin/players');
  revalidatePath('/admin/auction');
  revalidatePath('/display');
  revalidatePath('/teams');
  return null;
}

export async function importPlayersCsv(
  csvContent: string
): Promise<{ successCount: number; errors: string[] }> {
  const supabase = await requireAdmin().catch((e) => { throw e; });

  const { data: settings } = await supabase
    .from('settings')
    .select('default_base_price, bid_granularity, min_base_price')
    .eq('id', 1)
    .single();

  const defaultBasePrice = settings?.default_base_price ?? 100;
  const granularity      = settings?.bid_granularity ?? 1;
  const minBasePrice     = settings?.min_base_price ?? 0;

  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { successCount: 0, errors: ['CSV file is empty.'] };
  }

  // Check header
  const header = lines[0].toLowerCase();
  const startIndex = header.includes('name') ? 1 : 0;

  const errors: string[] = [];
  const validPayloads: Array<{
    name: string;
    position: string;
    category: string;
    base_price: number;
  }> = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rowNum = i + 1;
    const parts = lines[i].split(',').map((p) => p.trim());
    const name = parts[0];
    const rawPos = parts[1] || '';
    const rawCat = parts[2] || '';
    const rawPrice = parts[3];

    if (!name) {
      errors.push(`Row ${rowNum}: Name is missing.`);
      continue;
    }

    // Validate & normalize position
    const pos = normalizePositionCode(rawPos) || DEFAULT_POSITION;
    if (rawPos && !normalizePositionCode(rawPos)) {
      errors.push(
        `Row ${rowNum}: Invalid position "${rawPos}". Must match one of: ${POSITION_OPTIONS.map((p) => p.code).join(', ')}`
      );
      continue;
    }

    // Validate category (required)
    const cat = normalizeCategory(rawCat);
    if (!cat) {
      errors.push(
        `Row ${rowNum}: Invalid or missing category "${rawCat}". Must be one of: ${CATEGORY_OPTIONS.join(', ')}`
      );
      continue;
    }

    // Base price
    const basePrice = rawPrice ? Number(rawPrice) : defaultBasePrice;
    if (isNaN(basePrice) || basePrice < minBasePrice) {
      errors.push(`Row ${rowNum}: Base price must be at least ₹${minBasePrice}.`);
      continue;
    }
    if (granularity > 0 && basePrice % granularity !== 0) {
      errors.push(
        `Row ${rowNum}: Base price ₹${basePrice} must be a multiple of granularity (₹${granularity}).`
      );
      continue;
    }

    validPayloads.push({
      name,
      position: pos,
      category: cat,
      base_price: basePrice,
    });
  }

  if (errors.length > 0) {
    return { successCount: 0, errors };
  }

  if (validPayloads.length > 0) {
    const { error } = await supabase.from('players').insert(validPayloads);
    if (error) {
      return { successCount: 0, errors: [error.message] };
    }
  }

  revalidatePath('/admin/players');
  revalidatePath('/admin/auction');
  revalidatePath('/display');
  revalidatePath('/teams');
  return { successCount: validPayloads.length, errors: [] };
}

export async function unsellPlayer(playerId: string): Promise<string | null> {
  try {
    const supabase = await requireAdmin();

    // 1. Fetch current player details
    const { data: player, error: fetchErr } = await supabase
      .from('players')
      .select('id, name, status, team_id, sold_price')
      .eq('id', playerId)
      .single();

    if (fetchErr || !player) {
      return 'Player not found.';
    }

    if (player.status !== 'sold' && player.status !== 'unsold') {
      return 'Player is already available.';
    }

    const oldTeamId = player.team_id;
    const oldSoldPrice = player.sold_price;

    // 2. Un-sell the player
    const { error: updateErr } = await supabase
      .from('players')
      .update({
        status: 'available',
        team_id: null,
        sold_price: null,
      })
      .eq('id', playerId);

    if (updateErr) return updateErr.message;

    // 3. Log the undo event in bid_log for audit and realtime sync
    await supabase.from('bid_log').insert({
      player_id: playerId,
      team_id: oldTeamId,
      amount: oldSoldPrice,
      type: 'undo',
    });

    // 4. If this player is currently in auction_state, reset auction_state to idle
    const { data: state } = await supabase
      .from('auction_state')
      .select('current_player_id, status')
      .eq('id', 1)
      .single();

    if (state && state.current_player_id === playerId) {
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
    }

    revalidatePath('/admin/players');
    revalidatePath('/admin/auction');
    revalidatePath('/admin/teams');
    revalidatePath('/teams');
    revalidatePath('/display');
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}
