'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

export async function upsertTeam(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  let supabase;
  try {
    supabase = await requireAdmin();
  } catch (err: unknown) {
    return err instanceof Error ? err.message : 'Unauthorized';
  }

  const id          = (formData.get('id') as string | null) || undefined;
  const name        = ((formData.get('name') as string) || '').trim();
  const purse_total = Number(formData.get('purse_total'));
  const removeLogo  = formData.get('remove_logo') === 'true';
  const logoFile    = formData.get('logo_file');

  // 1. Basic validation
  if (!name) return 'Team name is required.';
  if (isNaN(purse_total) || purse_total <= 0) return 'Purse must be a positive number.';

  // 2. Fetch settings for bid_granularity check
  const { data: settings } = await supabase
    .from('settings')
    .select('bid_granularity, default_purse')
    .eq('id', 1)
    .single();

  const granularity = settings?.bid_granularity ?? 1;
  if (granularity > 0 && purse_total % granularity !== 0) {
    return `Purse ₹${purse_total} must be a multiple of bid granularity (₹${granularity}).`;
  }

  // 3. If editing an existing team: reject a purse lower than what it has already spent
  if (id) {
    const { data: soldPlayers } = await supabase
      .from('players')
      .select('sold_price')
      .eq('team_id', id)
      .eq('status', 'sold');

    const totalSpent = (soldPlayers ?? []).reduce(
      (sum, p) => sum + (Number(p.sold_price) || 0),
      0
    );

    if (purse_total < totalSpent) {
      return `Purse (₹${purse_total}) cannot be lower than what the team has already spent (₹${totalSpent}).`;
    }
  }

  // 4. Existing logo lookup
  let oldLogoUrl: string | null = null;
  if (id) {
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('logo_url')
      .eq('id', id)
      .single();
    oldLogoUrl = existingTeam?.logo_url ?? null;
  }

  let logo_url: string | null = oldLogoUrl;

  // 5. Handle logo removal or upload to public Supabase bucket 'branding' in 'teams/' folder
  if (removeLogo) {
    if (oldLogoUrl) {
      const oldPath = getStoragePath(oldLogoUrl, 'branding');
      if (oldPath) {
        await supabase.storage.from('branding').remove([oldPath]);
      }
    }
    logo_url = null;
  } else if (logoFile && typeof logoFile === 'object' && 'size' in logoFile && (logoFile as File).size > 0) {
    const file = logoFile as File;
    const timestamp = Date.now();
    const rawName = file.name.includes('.')
      ? file.name.substring(0, file.name.lastIndexOf('.'))
      : file.name;
    const baseName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const fileName = `teams/${timestamp}-${baseName}.webp`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('branding')
      .upload(fileName, fileBuffer, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      return `Failed to upload logo: ${uploadError.message}`;
    }

    const { data: publicUrlData } = supabase.storage
      .from('branding')
      .getPublicUrl(fileName);

    logo_url = publicUrlData.publicUrl;

    // Delete old logo if replaced
    if (oldLogoUrl && oldLogoUrl !== logo_url) {
      const oldPath = getStoragePath(oldLogoUrl, 'branding');
      if (oldPath) {
        await supabase.storage.from('branding').remove([oldPath]);
      }
    }
  }

  const payload = {
    name,
    purse_total,
    logo_url,
  };

  const { error } = id
    ? await supabase.from('teams').update(payload).eq('id', id)
    : await supabase.from('teams').insert(payload);

  if (error) return error.message;

  revalidatePath('/admin/teams');
  revalidatePath('/admin/auction');
  revalidatePath('/display');
  revalidatePath('/teams');
  return null;
}

export async function deleteTeam(teamId: string): Promise<string | null> {
  let supabase;
  try {
    supabase = await requireAdmin();
  } catch (err: unknown) {
    return err instanceof Error ? err.message : 'Unauthorized';
  }

  // 1. Block deleting a team that is currently the leading bidder in an auction
  const { data: auctionState } = await supabase
    .from('auction_state')
    .select('leading_team_id, status')
    .eq('id', 1)
    .single();

  if (auctionState?.leading_team_id === teamId) {
    return 'Cannot delete team while it is the leading bidder in an active auction.';
  }

  // 2. Block deleting a team that has players assigned
  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);

  if (count && count > 0) {
    return `Cannot delete team because it has ${count} player(s) assigned. Reassign or remove the players first.`;
  }

  // 3. Fetch team's logo_url to clean up from storage
  const { data: team } = await supabase
    .from('teams')
    .select('logo_url')
    .eq('id', teamId)
    .single();

  if (team?.logo_url) {
    const oldPath = getStoragePath(team.logo_url, 'branding');
    if (oldPath) {
      await supabase.storage.from('branding').remove([oldPath]);
    }
  }

  // 4. Delete team record
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) return error.message;

  revalidatePath('/admin/teams');
  revalidatePath('/admin/auction');
  revalidatePath('/display');
  revalidatePath('/teams');
  return null;
}
