'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { IncrementRule, OrderMode } from '@/lib/supabase/types';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

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

export async function saveSettings(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Not authenticated.';

  // Retrieve current settings to check existing logo_url for cleanup
  const { data: currentSettings } = await supabase
    .from('settings')
    .select('logo_url')
    .eq('id', 1)
    .single();

  const oldLogoUrl = currentSettings?.logo_url;

  // Handle Logo Upload / Removal in Supabase Storage bucket 'branding', folder 'logo/'
  const removeLogo = formData.get('remove_logo') === 'true';
  const logoFile = formData.get('logo_file');
  let newLogoUrl: string | null = oldLogoUrl ?? null;

  if (removeLogo) {
    if (oldLogoUrl) {
      const oldPath = getStoragePath(oldLogoUrl, 'branding');
      if (oldPath) {
        await supabase.storage.from('branding').remove([oldPath]);
      }
    }
    newLogoUrl = null;
  } else if (logoFile && typeof logoFile === 'object' && 'size' in logoFile && (logoFile as File).size > 0) {
    const file = logoFile as File;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return 'Please upload a PNG, JPG, or WebP image.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'Tournament logo must be 2 MB or smaller.';
    }

    // Generate unique timestamped filename in folder 'logo/'
    const timestamp = Date.now();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const baseName = file.name
      .substring(0, file.name.lastIndexOf('.'))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const fileName = `logo/${timestamp}-${baseName}.${ext}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload to 'branding' bucket
    const { error: uploadError } = await supabase.storage
      .from('branding')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return `Failed to upload logo: ${uploadError.message}`;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('branding')
      .getPublicUrl(fileName);

    newLogoUrl = publicUrlData.publicUrl;

    // Delete previous logo file if it was in 'branding' bucket
    if (oldLogoUrl && oldLogoUrl !== newLogoUrl) {
      const oldPath = getStoragePath(oldLogoUrl, 'branding');
      if (oldPath) {
        await supabase.storage.from('branding').remove([oldPath]);
      }
    }
  }

  // Parse increment_rules: support either min_bid_increment or json array string
  const minIncrementRaw = formData.get('min_bid_increment');
  let increment_rules: IncrementRule[];
  try {
    if (minIncrementRaw != null && String(minIncrementRaw).trim() !== '') {
      const step = Number(minIncrementRaw);
      if (isNaN(step) || step <= 0) throw new Error('Minimum bid increment must be positive.');
      increment_rules = [{ upTo: null, step }];
    } else {
      const rulesRaw = ((formData.get('increment_rules') as string) || '').trim();
      if (rulesRaw.startsWith('[')) {
        const parsed = JSON.parse(rulesRaw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('At least one increment rule is required.');
        }
        for (const r of parsed) {
          if (typeof r !== 'object' || r === null) {
            throw new Error('Each increment rule must be an object.');
          }
          if (r.upTo !== null && (typeof r.upTo !== 'number' || isNaN(r.upTo) || r.upTo <= 0)) {
            throw new Error('Rule upTo must be null or a positive number.');
          }
          if (typeof r.step !== 'number' || isNaN(r.step) || r.step <= 0) {
            throw new Error('Rule step must be a positive number.');
          }
        }
        increment_rules = parsed as IncrementRule[];
      } else {
        increment_rules = [{ upTo: null, step: 1 }];
      }
    }
  } catch (e: unknown) {
    return `Invalid increment rules: ${e instanceof Error ? e.message : String(e)}`;
  }

  const theme_color = (formData.get('theme_color') as string)?.trim() || '#16a34a';

  const bid_granularity_val = Number(formData.get('bid_granularity'));
  const bid_granularity = isNaN(bid_granularity_val) || bid_granularity_val <= 0 ? 1 : bid_granularity_val;

  const allow_base_price_bid_raw = formData.get('allow_base_price_bid');
  const allow_base_price_bid =
    allow_base_price_bid_raw === 'on' ||
    allow_base_price_bid_raw === 'true' ||
    allow_base_price_bid_raw === '1';

  const rawTournamentName = formData.get('tournament_name');
  const tournament_name = typeof rawTournamentName === 'string' ? rawTournamentName.trim() : '';

  const payload = {
    tournament_name,
    logo_url:             newLogoUrl,
    theme_color,
    default_purse:        Number(formData.get('default_purse')),
    min_squad:            Number(formData.get('min_squad')),
    max_squad:            Number(formData.get('max_squad')),
    default_base_price:   Number(formData.get('default_base_price')),
    min_base_price:       Number(formData.get('min_base_price')),
    bid_granularity,
    allow_base_price_bid,
    order_mode:           (formData.get('order_mode') as OrderMode),
    increment_rules,
    updated_at:           new Date().toISOString(),
  };

  if (!payload.tournament_name) return 'Tournament name is required.';
  if (payload.min_squad > payload.max_squad) return 'Min squad cannot be greater than max squad.';

  const { error } = await supabase
    .from('settings')
    .upsert({ id: 1, ...payload }, { onConflict: 'id' });

  if (error) return error.message;

  revalidatePath('/admin/settings');
  revalidatePath('/admin/auction');
  revalidatePath('/display');
  revalidatePath('/teams');
  return null;
}
