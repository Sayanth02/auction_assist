'use client';

import React, { useState, useTransition, useRef, useMemo } from 'react';
import { upsertPlayer, deletePlayer, importPlayersCsv, unsellPlayer } from '@/app/actions/players';
import type { Player, Settings, Team } from '@/lib/supabase/types';
import {
  POSITION_OPTIONS,
  CATEGORY_OPTIONS,
  DEFAULT_POSITION,
  getPositionLabel,
  getInitials,
} from '@/lib/player-constants';
import { resizeImageToWebP } from '@/lib/image-util';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

interface Props {
  players: Player[];
  settings: Settings | null;
  teams?: Team[];
}

interface ModalConfig {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export default function PlayersList({ players, settings, teams = [] }: Props) {
  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  function triggerToast(text: string, isError = false) {
    setToastMessage({ text, isError });
  }

  function handleOpenAdd() {
    setEditing('new');
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function handleOpenEdit(player: Player) {
    setEditing(player);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function handleConfirmDelete(player: Player) {
    setModal({
      title: 'Remove this player?',
      description: `Remove "${player.name}" from the tournament? This deletes their record and stored photo.`,
      confirmText: 'Remove player',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setModalPending(true);
        try {
          if (editing && typeof editing === 'object' && editing.id === player.id) {
            setEditing(null);
          }
          const err = await deletePlayer(player.id);
          if (err) {
            triggerToast(err, true);
          } else {
            triggerToast(`${player.name} removed from roster.`);
            setModal(null);
          }
        } finally {
          setModalPending(false);
        }
      },
    });
  }

  function handleConfirmUnsell(player: Player) {
    const isSold = player.status === 'sold';
    const teamName = player.team_id ? teamMap[player.team_id] || 'their club' : null;

    setModal({
      title: isSold ? 'Undo player sale?' : 'Make player available?',
      description: isSold
        ? `Are you sure you want to undo the sale of "${player.name}"? This will remove them from ${teamName || 'their team'}, refund the team's purse by ₹${(player.sold_price || 0).toLocaleString('en-IN')}, and return them to the available auction pool.`
        : `Return "${player.name}" to the available pool for bidding?`,
      confirmText: isSold ? 'Undo sale' : 'Make available',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setModalPending(true);
        try {
          const err = await unsellPlayer(player.id);
          if (err) {
            triggerToast(err, true);
          } else {
            triggerToast(
              isSold
                ? `Sale for "${player.name}" has been undone.`
                : `"${player.name}" is now available for auction.`
            );
            setModal(null);
          }
        } finally {
          setModalPending(false);
        }
      },
    });
  }

  const tournamentName = settings?.tournament_name || '';
  const query = search.trim().toLowerCase();

  const filtered = players.filter((p) => {
    const nameMatch = p.name.toLowerCase().includes(query);
    const catMatch = (p.category ?? '').toLowerCase().includes(query);
    const posCodeMatch = (p.position ?? '').toLowerCase().includes(query);
    const posLabelMatch = getPositionLabel(p.position).toLowerCase().includes(query);
    return nameMatch || catMatch || posCodeMatch || posLabelMatch;
  });

  return (
    <div className="relative">
      {/* ── Page Header ── */}
      <div className="players-page-header">
        <div>
          <div className="eyebrow">
            {tournamentName ? (
              <>
                {tournamentName.toUpperCase()}{' '}
                <span style={{ opacity: 0.55 }}>/</span>{' '}
              </>
            ) : null}
            PLAYER MANAGEMENT
          </div>
          <h1 className="page-heading">
            The players<span className="text-[var(--yellow)]">.</span>
          </h1>
          <p className="page-subtitle">Build your roster. Get ready for the auction.</p>
        </div>

        {editing === null && (
          <div className="players-header-actions" id="playersHeaderActions">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="manage-add-primary"
              aria-label="Add new player"
            >
              <IconPlus />
              <span>Add player</span>
              <IconArrow />
            </button>
            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              className="players-import"
              aria-label="Import players via CSV"
            >
              <IconUpload />
              <span>Import CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="manage-toolbar">
        <div className="manage-search">
          <IconSearch />
          <input
            id="playersSearch"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, position or category..."
            autoComplete="off"
            aria-label="Search players by name, position or category"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="manage-search-clear"
              aria-label="Clear player search"
            >
              Clear
            </button>
          )}
        </div>
        <div className="manage-total">
          <strong id="playersTotal">{pad(players.length)}</strong>
          <span>
            PLAYERS
            <br />
            REGISTERED
          </span>
        </div>
      </div>

      {/* ── Collapsible Add/Edit Form Panel ── */}
      {editing !== null && (
        <div ref={formRef} className="players-form-card" id="playersFormPanel">
          <PlayerFormPanel
            player={editing === 'new' ? undefined : editing}
            settings={settings}
            onClose={() => setEditing(null)}
            onSuccess={(msg) => {
              setEditing(null);
              triggerToast(msg);
            }}
          />
        </div>
      )}

      {/* ── Section Subheader ── */}
      <div className="manage-section-head">
        <div>
          <div className="manage-kicker">THE AUCTION ROSTER / PLAYER DIRECTORY</div>
          <h2 className="manage-section-title">
            All players{' '}
            <span className="manage-count-chip" id="playersCountChip">
              {pad(players.length)} {players.length === 1 ? 'PLAYER' : 'PLAYERS'}
            </span>
          </h2>
          <p className="manage-result-count" role="status" aria-live="polite">
            {filtered.length} of {players.length} {players.length === 1 ? 'player' : 'players'}
          </p>
        </div>
        <div className="manage-section-label">EDIT DETAILS / MANAGE PHOTOS</div>
      </div>

      {/* ── Player Roster Grid ── */}
      {filtered.length > 0 ? (
        <section className="players-roster" id="playersGrid" aria-label="Player directory">
          {filtered.map((player, index) => (
            <PlayerCard
              key={player.id}
              player={player}
              index={index}
              teamName={player.team_id ? teamMap[player.team_id] : null}
              onEdit={() => handleOpenEdit(player)}
              onDelete={() => handleConfirmDelete(player)}
              onUnsell={() => handleConfirmUnsell(player)}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title={query ? 'No players found' : 'No players registered'}
          description={
            query
              ? `No players match "${search}". Try searching for another name, position, or category.`
              : 'There are no players in the auction roster yet. Start by adding your first player or importing a CSV.'
          }
          className="my-6"
          action={
            <button
              type="button"
              className="players-add-primary"
              onClick={() => {
                if (query) setSearch('');
                else handleOpenAdd();
              }}
            >
              {query ? 'Clear search' : '+ Add player'}
            </button>
          }
        />
      )}

      {/* ── Footer Branding Note ── */}
      <footer className="footer mt-6">
        <div>
          <strong>{tournamentName || 'AUCTION ASSIST'}</strong> / PLAYER MANAGEMENT
        </div>
        <div className="footer-note">ROSTER READY · PUBLIC STORAGE BRANDING</div>
      </footer>

      {/* ── CSV Import Modal ── */}
      {showCsvModal && (
        <CsvImportModal
          settings={settings}
          onClose={() => setShowCsvModal(false)}
          onSuccess={(count) => {
            setShowCsvModal(false);
            triggerToast(`Successfully imported ${count} players!`);
          }}
        />
      )}

      {/* ── Confirmation Modal ── */}
      {modal && (
        <ConfirmDialog
          isOpen={true}
          eyebrow={`${tournamentName ? tournamentName.toUpperCase() + ' · ' : ''}ROSTER MANAGEMENT`}
          title={modal.title}
          description={modal.description}
          confirmText={modal.confirmText || 'Confirm'}
          cancelText={modal.cancelText || 'Cancel'}
          isDanger={modal.isDanger}
          isPending={modalPending}
          pendingText="Processing…"
          onConfirm={modal.onConfirm}
          onClose={() => {
            if (!modalPending) setModal(null);
          }}
        />
      )}

      {/* ── Floating Toast Notification ── */}
      <Toast
        message={toastMessage?.text ?? null}
        isError={toastMessage?.isError}
        onDismiss={() => setToastMessage(null)}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* ── PLAYER CARD COMPONENT                                        ── */
/* ══════════════════════════════════════════════════════════════════ */
function PlayerCard({
  player,
  index,
  teamName,
  onEdit,
  onDelete,
  onUnsell,
}: {
  player: Player;
  index: number;
  teamName?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onUnsell: () => void;
}) {
  const posCode = player.position || 'NS';
  const posLabel = getPositionLabel(player.position);
  const statusUpper = (player.status || 'available').toUpperCase();

  return (
    <article className="player-card" data-player-id={player.id}>
      {/* Left visual strip */}
      <div className="player-visual">
        <span className="player-position-tag">{posCode}</span>
        <div className="player-portrait" aria-label={`${player.name} photo`}>
          {player.photo_url ? (
            <ImageWithFallback
              src={player.photo_url}
              alt={player.name}
              className="w-full h-full object-cover"
              fallbackText={getInitials(player.name)}
            />
          ) : (
            <span className="player-portrait-fallback" aria-hidden="true">
              {getInitials(player.name)}
            </span>
          )}
        </div>
        <span className="player-photo-note">
          {player.photo_url ? 'PHOTO ATTACHED' : 'NO PHOTO'}
        </span>
      </div>

      {/* Right body copy */}
      <div className="player-copy">
        <div className="player-copy-top">
          <span className="player-index">PLAYER {pad(index + 1)}</span>
          <span
            className={`player-status ${
              player.status === 'sold'
                ? 'sold'
                : player.status === 'unsold'
                ? 'unsold'
                : ''
            }`}
          >
            {statusUpper}
          </span>
        </div>

        <h3 className="player-card-name" title={player.name}>
          {player.name}
        </h3>

        <div className="player-details-grid">
          <div className="player-detail">
            <small>Position</small>
            <strong className="player-position-value" title={posLabel}>
              {posLabel}
            </strong>
          </div>
          <div className="player-detail">
            <small>Category</small>
            <strong className="player-category-value">
              {player.category || 'Not specified'}
            </strong>
          </div>
        </div>

        <div className="player-base-price">
          <small>Base price</small>
          <strong>₹{Number(player.base_price).toLocaleString('en-IN')}</strong>
        </div>

        {player.status === 'sold' && (
          <div className="mt-2 py-1 px-2.5 bg-amber-50 border border-amber-300 text-amber-950 font-bold text-xs flex items-center justify-between">
            <span>Sold to {teamName || 'Team'}</span>
            <span className="font-mono text-emerald-800 font-extrabold">
              ₹{Number(player.sold_price || 0).toLocaleString('en-IN')}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="player-actions">
        {player.status === 'sold' && (
          <button
            type="button"
            onClick={onUnsell}
            className="player-unsell"
            aria-label={`Undo sale for ${player.name}`}
            title={`Undo sale for ${player.name} and return to available pool`}
          >
            <IconUndo />
            <span>UNDO SALE</span>
          </button>
        )}
        {player.status === 'unsold' && (
          <button
            type="button"
            onClick={onUnsell}
            className="player-unsell"
            aria-label={`Make ${player.name} available`}
            title={`Return ${player.name} to available pool`}
          >
            <IconUndo />
            <span>AVAILABLE</span>
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="player-edit"
          aria-label={`Edit ${player.name}`}
        >
          <IconEdit />
          <span>EDIT PLAYER</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="player-delete"
          aria-label={`Delete ${player.name}`}
        >
          <IconTrash />
          <span>DELETE</span>
        </button>
      </div>
    </article>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* ── PLAYER FORM PANEL (Add / Edit)                               ── */
/* ══════════════════════════════════════════════════════════════════ */
function PlayerFormPanel({
  player,
  settings,
  onClose,
  onSuccess,
}: {
  player?: Player;
  settings: Settings | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const isNew = !player;
  const granularity = settings?.bid_granularity ?? 1;
  const defaultBasePrice = player?.base_price ?? (settings?.default_base_price ?? 100);

  const [name, setName] = useState(player?.name ?? '');
  const [basePrice, setBasePrice] = useState<string>(String(defaultBasePrice));
  const [position, setPosition] = useState<string>(player?.position ?? DEFAULT_POSITION);
  const [category, setCategory] = useState<string>(player?.category ?? '');

  // Photo management state
  const [previewUrl, setPreviewUrl] = useState<string | null>(player?.photo_url ?? null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Field validation error states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, startSavingTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoFeedback({ text: 'Please choose an image file (PNG, JPG, WebP).', isError: true });
      e.target.value = '';
      return;
    }

    setIsProcessingPhoto(true);
    setPhotoFeedback({ text: 'Resizing to max 800 px and converting to WebP…' });

    try {
      const { blob, fileName } = await resizeImageToWebP(file, 800, 0.85);
      setPhotoBlob(blob);
      setPhotoFileName(fileName);
      setPreviewUrl(URL.createObjectURL(blob));
      setIsPhotoRemoved(false);
      setPhotoFeedback({ text: `Photo ready · WebP converted (${Math.round(blob.size / 1024)} KB)` });
    } catch (err: unknown) {
      setPhotoFeedback({
        text: err instanceof Error ? err.message : 'Error converting photo to WebP',
        isError: true,
      });
    } finally {
      setIsProcessingPhoto(false);
      e.target.value = '';
    }
  }

  function handleRemovePhoto() {
    setPreviewUrl(null);
    setPhotoBlob(null);
    setPhotoFileName('');
    setIsPhotoRemoved(true);
    setPhotoFeedback(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = 'Please enter a player name.';
    }

    const priceNum = Number(basePrice);
    if (basePrice === '' || isNaN(priceNum) || priceNum < 0) {
      nextErrors.basePrice = 'Enter a valid non-negative base price.';
    } else if (granularity > 0 && priceNum % granularity !== 0) {
      nextErrors.basePrice = `Base price must be a multiple of ₹${granularity}.`;
    }

    if (!position) {
      nextErrors.position = 'Please select a position.';
    }

    if (!category.trim()) {
      nextErrors.category = 'Please select a category.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    startSavingTransition(async () => {
      const formData = new FormData();
      if (player?.id) formData.set('id', player.id);
      formData.set('name', name.trim());
      formData.set('base_price', basePrice);
      formData.set('position', position);
      formData.set('category', category);

      if (photoBlob) {
        formData.set('photo_file', photoBlob, photoFileName);
      }
      if (isPhotoRemoved) {
        formData.set('remove_photo', 'true');
      }

      const errorResult = await upsertPlayer(null, formData);
      if (errorResult) {
        setErrors((prev) => ({ ...prev, form: errorResult }));
      } else {
        onSuccess(isNew ? 'Player added to roster.' : 'Player details updated.');
      }
    });
  }

  return (
    <>
      <div className="manage-form-head">
        <span className="manage-form-number">
          {isNew ? <IconPlus /> : <IconEdit />}
        </span>
        <div className="manage-form-head-copy">
          <h2 id="playersFormTitle">
            {isNew ? 'Add new player' : `Edit player: ${player?.name}`}
          </h2>
          <p id="playersFormSubtitle">
            {isNew
              ? 'Add a player to your auction roster.'
              : 'Update this player’s details and photo.'}
          </p>
        </div>
        <span className="manage-form-tag" id="playersFormTag">
          {isNew ? 'NEW PLAYER' : 'EDIT PLAYER'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="manage-form-close"
          aria-label="Close player form"
        >
          <IconClose />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="players-form-layout">
          {/* Left inputs grid */}
          <div className="players-form-fields">
            {player?.status === 'sold' && (
              <div className="p-3 bg-amber-50 border-2 border-amber-300 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-black text-amber-950 uppercase tracking-wider block">
                    CURRENT STATUS: SOLD
                  </span>
                  <span className="text-amber-800">
                    Sold for ₹{Number(player.sold_price || 0).toLocaleString('en-IN')}.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    const err = await unsellPlayer(player.id);
                    if (err) {
                      setErrors((prev) => ({ ...prev, form: err }));
                    } else {
                      onSuccess(`Sale for "${player.name}" undone. Player is now available.`);
                    }
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider transition-colors shrink-0 shadow"
                >
                  Undo Sale &amp; Return to Pool
                </button>
              </div>
            )}
            {player?.status === 'unsold' && (
              <div className="p-3 bg-slate-100 border-2 border-slate-300 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-black text-slate-800 uppercase tracking-wider block">
                    CURRENT STATUS: UNSOLD
                  </span>
                  <span className="text-slate-600">
                    Marked unsold during auction.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    const err = await unsellPlayer(player.id);
                    if (err) {
                      setErrors((prev) => ({ ...prev, form: err }));
                    } else {
                      onSuccess(`"${player.name}" is now available for auction.`);
                    }
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider transition-colors shrink-0 shadow"
                >
                  Make Available
                </button>
              </div>
            )}

            {/* Player Name */}
            <div className={`manage-field ${errors.name ? 'invalid' : ''}`} id="playersNameField">
              <label className="manage-field-label" htmlFor="playersName">
                Player name <span aria-hidden="true">*</span>
              </label>
              <div className="manage-field-control">
                <input
                  id="playersName"
                  name="playerName"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  placeholder="e.g. Lionel Messi"
                  required
                  autoComplete="off"
                />
              </div>
              {errors.name && <span className="manage-field-error">{errors.name}</span>}
            </div>

            {/* Base Price */}
            <div className={`manage-field ${errors.basePrice ? 'invalid' : ''}`} id="playersBaseField">
              <label className="manage-field-label" htmlFor="playersBase">
                Base price (₹) <span aria-hidden="true">*</span>
              </label>
              <div className="manage-field-control">
                <span className="manage-prefix" aria-hidden="true">₹</span>
                <input
                  id="playersBase"
                  name="basePrice"
                  type="number"
                  inputMode="numeric"
                  value={basePrice}
                  onChange={(e) => {
                    setBasePrice(e.target.value);
                    if (errors.basePrice) setErrors((prev) => ({ ...prev, basePrice: '' }));
                  }}
                  min={0}
                  step="any"
                  required
                />
              </div>
              <p className="manage-field-help" id="playersBaseHelp">
                Prefilled with ₹{settings?.default_base_price ?? 100}. Must be a multiple of ₹{granularity}.
              </p>
              {errors.basePrice && <span className="manage-field-error">{errors.basePrice}</span>}
            </div>

            {/* Position */}
            <div className={`manage-field ${errors.position ? 'invalid' : ''}`} id="playersPositionField">
              <label className="manage-field-label" htmlFor="playersPosition">
                Position <span aria-hidden="true">*</span>
              </label>
              <div className="manage-field-control player-select-wrap">
                <select
                  id="playersPosition"
                  name="position"
                  value={position}
                  onChange={(e) => {
                    setPosition(e.target.value);
                    if (errors.position) setErrors((prev) => ({ ...prev, position: '' }));
                  }}
                  required
                >
                  {POSITION_OPTIONS.map((pos) => (
                    <option key={pos.code} value={pos.code}>
                      {pos.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="manage-field-help" id="playersPositionHelp">
                Short codes stored: GK, DEF, MID, W, ST, CB, FW, NS.
              </p>
              {errors.position && <span className="manage-field-error">{errors.position}</span>}
            </div>

            {/* Category */}
            <div className={`manage-field ${errors.category ? 'invalid' : ''}`} id="playersCategoryField">
              <label className="manage-field-label" htmlFor="playersCategory">
                Category <span aria-hidden="true">*</span>
              </label>
              <div className="manage-field-control player-select-wrap">
                <select
                  id="playersCategory"
                  name="category"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
                  }}
                  required
                >
                  <option value="" disabled>
                    — Select category (required) —
                  </option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <p className="manage-field-help" id="playersCategoryHelp">
                Required option for player tier / bidding order.
              </p>
              {errors.category && <span className="manage-field-error">{errors.category}</span>}
            </div>
          </div>

          {/* Right photo picker column */}
          <div className="player-photo-field">
            <div className="manage-field-label">Player photo</div>
            <div className="player-photo-picker">
              <div className="player-portrait player-form-portrait" id="playersPhotoPreview">
                {previewUrl ? (
                  <ImageWithFallback
                    src={previewUrl}
                    alt="Preview portrait"
                    className="w-full h-full object-cover"
                    fallbackText={getInitials(name || 'Player')}
                  />
                ) : (
                  <span className="player-portrait-fallback">
                    {getInitials(name || 'Player')}
                  </span>
                )}
              </div>
              <div className="player-photo-copy">
                <p className="player-photo-title" id="playersPhotoTitle">
                  {previewUrl ? 'Current player photo' : 'Add a player photo'}
                </p>
                <p className="player-photo-help">
                  Resized in browser to max 800 px and converted to WebP.
                </p>
                <div className="player-photo-actions">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingPhoto || isSaving}
                    className="player-photo-action"
                    id="playersChoosePhoto"
                  >
                    {previewUrl ? 'Replace photo ↗' : 'Choose photo ↗'}
                  </button>
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={isProcessingPhoto || isSaving}
                      className="player-photo-action remove"
                      id="playersRemovePhoto"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  id="playersPhotoFile"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Upload player photo"
                />
              </div>
            </div>

            {photoFeedback && (
              <p
                className={`player-photo-feedback ${photoFeedback.isError ? 'error' : ''}`}
                role="status"
              >
                {photoFeedback.text}
              </p>
            )}
          </div>
        </div>

        {/* Global form error message */}
        {errors.form && (
          <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 text-xs text-red-700 font-bold">
            {errors.form}
          </div>
        )}

        {/* Bottom actions strip */}
        <div className="manage-form-bottom">
          <div className="players-form-note">
            Photos are saved to public Supabase bucket <code>branding/players/</code>. Old photos are deleted on replace or delete.
          </div>
          <div className="manage-form-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="manage-form-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isProcessingPhoto}
              className="manage-form-submit"
            >
              <span>{isSaving ? 'Saving…' : isNew ? 'Add player' : 'Save changes'}</span>
              <IconArrow />
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* ── CSV IMPORT MODAL (Neo-Brutalist)                              ── */
/* ══════════════════════════════════════════════════════════════════ */
function CsvImportModal({
  settings,
  onClose,
  onSuccess,
}: {
  settings: Settings | null;
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const defaultBasePrice = settings?.default_base_price ?? 100;
  const granularity = settings?.bid_granularity ?? 1;

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
    startTransition(async () => {
      const res = await importPlayersCsv(csvText);
      if (res.errors.length > 0) {
        setErrors(res.errors);
      } else {
        onSuccess(res.successCount);
      }
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="csvModalTitle">
      <div className="modal max-w-[580px] w-full">
        <div className="modal-top">
          <span className="modal-eyebrow">BATCH ROSTER IMPORT</span>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close dialog">
            <IconClose />
          </button>
        </div>

        <h2 id="csvModalTitle">Import Players via CSV</h2>
        <p className="modal-desc">
          Upload or paste a comma-separated list of players to import them directly into your roster.
        </p>

        {/* Format guide box */}
        <div className="bg-[#edf2ff] border border-[#bac9eb] p-3 text-xs text-[#142351] space-y-1 my-3">
          <p>
            <strong>CSV Columns:</strong> <code>Name, Position, Category, BasePrice</code>
          </p>
          <p>
            <strong>Allowed Positions:</strong> <code>{POSITION_OPTIONS.map((p) => p.code).join(', ')}</code>
          </p>
          <p>
            <strong>Allowed Categories:</strong> <code>{CATEGORY_OPTIONS.join(', ')}</code>
          </p>
          <p>
            <strong>Base Price:</strong> Optional (defaults to ₹{defaultBasePrice}, must be a multiple of ₹{granularity}).
          </p>
        </div>

        {/* File chooser */}
        <div className="my-2">
          <label className="block text-[10px] font-bold tracking-wider text-[#101c4a] uppercase mb-1">
            Choose CSV file:
          </label>
          <input
            type="file"
            accept=".csv, text/csv"
            onChange={handleFileLoad}
            className="block w-full text-xs text-[#101c4a] file:mr-3 file:py-1.5 file:px-3 file:border-2 file:border-[#081342] file:text-[10px] file:font-bold file:uppercase file:bg-[#efff00] file:text-[#081342] cursor-pointer"
          />
        </div>

        {/* Textarea */}
        <div className="my-2">
          <label className="block text-[10px] font-bold tracking-wider text-[#101c4a] uppercase mb-1">
            Or paste CSV data:
          </label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder={`Name, Position, Category, BasePrice\nLionel Messi, ST, Senior, 100\nBukayo Saka, W, Young, 100\nManuel Neuer, GK, Senior, 100`}
            className="w-full p-2.5 text-xs font-mono border-2 border-[#bbc9e7] bg-[#f8faff] text-[#101c4a] focus:bg-white focus:border-[#1947f4] outline-none"
          />
        </div>

        {/* Validation Errors Box */}
        {errors.length > 0 && (
          <div className="p-3 bg-[#fff0f2] border-2 border-[#b2192e] text-xs text-[#b2192e] max-h-36 overflow-y-auto space-y-1 my-2">
            <p className="font-bold uppercase tracking-wider">Validation Errors ({errors.length}):</p>
            {errors.map((err, i) => (
              <p key={i}>• {err}</p>
            ))}
          </div>
        )}

        {/* Modal actions */}
        <div className="modal-actions mt-4">
          <button type="button" onClick={onClose} disabled={isPending} className="modal-btn cancel">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isPending || !csvText.trim()}
            className="modal-btn confirm"
          >
            {isPending ? 'Validating…' : 'Validate & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* ── INLINE SVG ICONS (Theme-Consistent)                          ── */
/* ══════════════════════════════════════════════════════════════════ */
function IconPlus() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 16-.5 4.5L8 20 19.5 8.5 15.5 4.5 4 16ZM13.5 6.5l4 4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V4m-4 4 4-4 4 4M4 16v4h16v-4" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5-5M3 10l5 5" />
    </svg>
  );
}
