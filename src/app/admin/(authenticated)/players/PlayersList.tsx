'use client';

import { useState, useActionState, useTransition, useRef } from 'react';
import { upsertPlayer, deletePlayer, importPlayersCsv } from '@/app/actions/players';
import type { Player, Settings } from '@/lib/supabase/types';
import {
  POSITION_OPTIONS,
  CATEGORY_OPTIONS,
  DEFAULT_POSITION,
  getPositionLabel,
  getInitials,
} from '@/lib/player-constants';
import { resizeImageToWebP } from '@/lib/image-util';

const STATUS_BADGE: Record<Player['status'], string> = {
  available: 'bg-blue-100 text-blue-700',
  sold:      'bg-green-100 text-green-700',
  unsold:    'bg-gray-100 text-gray-500',
};

interface Props {
  players: Player[];
  settings: Settings | null;
}

export default function PlayersList({ players, settings }: Props) {
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = players.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.position ?? '').toLowerCase().includes(search.toLowerCase()) ||
      getPositionLabel(p.position).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {editing !== 'new' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing('new')}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-md text-sm transition-colors whitespace-nowrap shadow-xs"
            >
              + Add player
            </button>
            <button
              onClick={() => setShowCsvModal(true)}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap"
            >
              📥 Import CSV
            </button>
          </div>
        )}
        <input
          type="search"
          placeholder="Search by name, position or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* CSV Import Modal */}
      {showCsvModal && (
        <CsvImportModal
          settings={settings}
          onClose={() => setShowCsvModal(false)}
        />
      )}

      {/* Add form */}
      {editing === 'new' && (
        <PlayerForm
          settings={settings}
          onDone={() => setEditing(null)}
        />
      )}

      {/* Count */}
      <p className="text-xs text-gray-500">
        {filtered.length} of {players.length} player{players.length !== 1 ? 's' : ''}
      </p>

      {/* Empty State */}
      {filtered.length === 0 && editing !== 'new' && (
        <p className="text-gray-500 text-sm py-4 text-center bg-white rounded-lg border">
          No players found. Click &quot;+ Add player&quot; or &quot;Import CSV&quot; above.
        </p>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.map((player) =>
          editing && (editing as Player).id === player.id ? (
            <PlayerForm
              key={player.id}
              player={player}
              settings={settings}
              onDone={() => setEditing(null)}
            />
          ) : (
            <PlayerRow
              key={player.id}
              player={player}
              onEdit={() => setEditing(player)}
            />
          ),
        )}
      </div>
    </div>
  );
}

/* ── Player Row Component ── */
function PlayerRow({ player, onEdit }: { player: Player; onEdit: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Delete player "${player.name}"? This removes their record and photo.`)) return;
    startTransition(async () => {
      const e = await deletePlayer(player.id);
      if (e) setErr(e);
    });
  }

  return (
    <div className="bg-white shadow rounded-lg px-4 py-3 flex items-center justify-between gap-4 border border-gray-100">
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Photo avatar or Fallback Initials */}
        {player.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photo_url}
            alt={player.name}
            className="w-12 h-12 rounded-full object-cover border border-gray-200 shrink-0 bg-gray-50"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0 tracking-wider shadow-2xs"
            title="No photo uploaded"
          >
            {getInitials(player.name)}
          </div>
        )}

        {/* Details */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 truncate">{player.name}</p>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${STATUS_BADGE[player.status]}`}
            >
              {player.status}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-0.5">
            <span className="font-semibold text-gray-700">{getPositionLabel(player.position)}</span>
            {' · '}
            <span className="text-slate-600">{player.category || 'No Category'}</span>
            {' · '}
            <span className="font-mono font-bold text-emerald-700">Base ₹{player.base_price}</span>
          </p>

          {err && <p className="text-red-600 text-xs mt-0.5">{err}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 font-semibold text-gray-700 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 font-semibold transition-colors"
        >
          {isPending ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

/* ── Player Form (Create + Edit) ── */
function PlayerForm({
  player,
  settings,
  onDone,
}: {
  player?: Player;
  settings: Settings | null;
  onDone: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(player?.photo_url ?? null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [isPhotoRemoved, setIsPhotoRemoved] = useState<boolean>(false);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Default base price: prefill from settings.default_base_price (100)
  const defaultBasePrice = player?.base_price ?? (settings?.default_base_price ?? 100);
  const granularity = settings?.bid_granularity ?? 1;

  const [error, action, pending] = useActionState(
    async (prev: string | null, formData: FormData) => {
      // If a resized WebP blob was prepared, attach it to formData
      if (photoBlob) {
        formData.set('photo_file', photoBlob, photoFileName);
      }
      if (isPhotoRemoved) {
        formData.set('remove_photo', 'true');
      }

      const result = await upsertPlayer(prev, formData);
      if (!result) onDone();
      return result;
    },
    null,
  );

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      // Resize in browser to max 800 px and convert to WebP
      const { blob, fileName } = await resizeImageToWebP(file, 800, 0.85);
      setPhotoBlob(blob);
      setPhotoFileName(fileName);
      setPreviewUrl(URL.createObjectURL(blob));
      setIsPhotoRemoved(false);
    } catch (err: unknown) {
      setClientError(err instanceof Error ? err.message : 'Error processing image');
    } finally {
      setIsProcessingImage(false);
    }
  }

  function handleRemovePhoto() {
    setPreviewUrl(null);
    setPhotoBlob(null);
    setPhotoFileName('');
    setIsPhotoRemoved(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <form action={action} className="bg-white shadow rounded-xl p-5 space-y-4 border border-gray-200">
      {player && <input type="hidden" name="id" value={player.id} />}

      <h3 className="font-bold text-gray-900 border-b pb-2 text-sm">
        {player ? `Edit Player: ${player.name}` : 'Add New Player'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name (Required) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Player Name *
          </label>
          <input
            name="name"
            type="text"
            defaultValue={player?.name ?? ''}
            placeholder="e.g. Lionel Messi"
            required
            className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Base Price (Prefilled from settings.default_base_price, validated to granularity) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Base Price (₹) *
          </label>
          <input
            name="base_price"
            type="number"
            step="any"
            min="0"
            defaultValue={defaultBasePrice}
            required
            className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <p className="text-[11px] text-gray-500 mt-0.5">
            Prefilled with ₹{settings?.default_base_price ?? 100}. Must be a multiple of ₹{granularity}.
          </p>
        </div>

        {/* Position Dropdown */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Position *
          </label>
          <select
            name="position"
            defaultValue={player?.position ?? DEFAULT_POSITION}
            className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {POSITION_OPTIONS.map((pos) => (
              <option key={pos.code} value={pos.code}>
                {pos.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Stored as short code (GK, DEF, MID, W, ST, NS).
          </p>
        </div>

        {/* Category Dropdown (Required, no default) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Category *
          </label>
          <select
            name="category"
            defaultValue={player?.category ?? ''}
            required
            className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="" disabled>
              -- Select Category (Required) --
            </option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── PHOTO UPLOAD SECTION (WebP converted & resized to max 800px) ── */}
      <div className="pt-2 border-t border-gray-100">
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          Player Photo
        </label>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Avatar Preview or Fallback Initials */}
          <div className="w-16 h-16 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-bold text-slate-500 text-sm">
                {player?.name ? getInitials(player.name) : 'Photo'}
              </span>
            )}
          </div>

          <div className="flex-1 w-full space-y-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={isProcessingImage}
              className="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 hover:file:bg-gray-200 cursor-pointer"
            />
            <p className="text-[11px] text-gray-500">
              Resized in browser to max 800 px and converted to WebP. Stored in <code>branding/players/</code>.
            </p>
          </div>

          {previewUrl && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shrink-0"
            >
              Remove
            </button>
          )}
        </div>

        {clientError && (
          <p className="text-red-600 text-xs font-semibold mt-1">{clientError}</p>
        )}
      </div>

      {error && <p className="text-red-600 text-xs font-semibold">{error}</p>}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          type="submit"
          disabled={pending || isProcessingImage}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors shadow-xs"
        >
          {pending ? 'Saving…' : isProcessingImage ? 'Processing photo…' : player ? 'Update Player' : 'Add Player'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── CSV Import Modal Component ── */
function CsvImportModal({
  settings,
  onClose,
}: {
  settings: Settings | null;
  onClose: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || '');
    };
    reader.readAsText(file);
  }

  function handleImport() {
    setErrors([]);
    setResultMessage(null);

    startTransition(async () => {
      const res = await importPlayersCsv(csvText);
      if (res.errors.length > 0) {
        setErrors(res.errors);
      } else {
        setResultMessage(`Successfully imported ${res.successCount} players!`);
        setTimeout(() => onClose(), 1500);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-bold text-gray-900 text-base">Import Players via CSV</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm font-bold">
            ✕
          </button>
        </div>

        <div className="text-xs text-gray-600 space-y-1">
          <p>Format: <code>Name, Position, Category, BasePrice</code></p>
          <p>
            Positions: <strong>GK, DEF, MID, W, ST, NS</strong>
          </p>
          <p>
            Categories: <strong>{CATEGORY_OPTIONS.join(', ')}</strong>
          </p>
          <p>
            Default base price if blank: <strong>₹{settings?.default_base_price ?? 100}</strong> (multiple of ₹{settings?.bid_granularity ?? 1}).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Choose CSV file:
          </label>
          <input
            type="file"
            accept=".csv, text/csv"
            onChange={handleFileLoad}
            className="block w-full text-xs text-gray-700 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-gray-100 hover:file:bg-gray-200"
          />
        </div>

        <div className="flex-1 flex flex-col min-h-32">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Or paste CSV data here:
          </label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder={`Name, Position, Category, BasePrice\nKylian Mbappe, ST, Senior, 100\nBukayo Saka, W, Young, 100\nDeclan Rice, MID, Experienced, 100`}
            className="w-full flex-1 p-2.5 text-xs font-mono border rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 bg-white text-gray-900"
          />
        </div>

        {errors.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 max-h-36 overflow-y-auto space-y-1">
            <p className="font-bold">Validation Errors ({errors.length}):</p>
            {errors.map((err, i) => (
              <p key={i}>• {err}</p>
            ))}
          </div>
        )}

        {resultMessage && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-bold">
            {resultMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isPending || !csvText.trim()}
            className="px-5 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs"
          >
            {isPending ? 'Validating…' : 'Validate & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
