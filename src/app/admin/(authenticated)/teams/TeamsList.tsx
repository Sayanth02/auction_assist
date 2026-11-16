'use client';

import { useState, useActionState, useRef } from 'react';
import { upsertTeam, deleteTeam } from '@/app/actions/teams';
import type { Team, Settings } from '@/lib/supabase/types';
import type { TeamStatsSummary } from './page';
import { getTeamInitials } from '@/lib/team-utils';
import { resizeImageToWebP } from '@/lib/image-util';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

interface Props {
  teams: Team[];
  settings: Settings | null;
  teamStats: Record<string, TeamStatsSummary>;
}

interface ModalConfig {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function TeamsList({ teams, settings, teamStats }: Props) {
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [search, setSearch] = useState('');
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
    }, 50);
  }

  function handleOpenEdit(team: Team) {
    setEditing(team);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  const tournamentName = settings?.tournament_name || '';
  const query = search.trim().toLowerCase();
  const filtered = teams.filter((t) => t.name.toLowerCase().includes(query));

  return (
    <div className="relative">
      {/* ── Page Header ── */}
      <div className="manage-page-header">
        <div>
          <div className="eyebrow">
            {tournamentName ? (
              <>
                {tournamentName.toUpperCase()}{' '}
                <span style={{ opacity: 0.55 }}>/</span>{' '}
              </>
            ) : null}
            CLUB MANAGEMENT
          </div>
          <h1 className="page-heading">
            The teams<span className="text-[var(--yellow)]">.</span>
          </h1>
          <p className="page-subtitle">Build the clubs. Get ready for auction day.</p>
        </div>

        {editing === null && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="manage-add-primary"
            aria-label="Add new team"
          >
            <IconPlus />
            <span>+ Add team</span>
            <IconArrow />
          </button>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="manage-toolbar">
        <div className="manage-search">
          <IconSearch />
          <input
            id="teamSearch"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams by name..."
            autoComplete="off"
            aria-label="Search clubs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="manage-search-clear"
              aria-label="Clear team search"
            >
              Clear
            </button>
          )}
        </div>
        <div className="manage-total">
          <strong>{String(teams.length).padStart(2, '0')}</strong>
          <span>
            CLUBS
            <br />
            REGISTERED
          </span>
        </div>
      </div>

      {/* ── Collapsible Add / Edit Form Panel ── */}
      {editing !== null && (
        <div ref={formRef} className="manage-form-card" id="teamFormPanel">
          <TeamFormPanel
            editing={editing}
            settings={settings}
            stats={editing === 'new' ? undefined : teamStats[editing.id]}
            onDone={() => {
              const wasNew = editing === 'new';
              setEditing(null);
              triggerToast(wasNew ? 'Team registered successfully.' : 'Team updated successfully.');
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {/* ── Section Head ── */}
      <div className="manage-section-head">
        <div>
          <div className="manage-kicker">The clubhouse / team directory</div>
          <h2 className="manage-section-title">
            All teams{' '}
            <span className="manage-count-chip">
              {String(teams.length).padStart(2, '0')} {teams.length === 1 ? 'CLUB' : 'CLUBS'}
            </span>
          </h2>
          <p className="manage-result-count" role="status" aria-live="polite">
            {filtered.length} of {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </p>
        </div>
        <div className="manage-section-label">EDIT DETAILS / MANAGE CRESTS</div>
      </div>

      {/* ── Team Directory Grid ── */}
      {filtered.length > 0 ? (
        <div className="manage-grid" id="manageTeamGrid" aria-label="Team directory">
          {filtered.map((team, index) => {
            const stats = teamStats[team.id] ?? { assignedCount: 0, soldCount: 0, spent: 0 };
            return (
              <TeamCard
                key={team.id}
                team={team}
                index={index}
                stats={stats}
                tournamentName={tournamentName}
                onEdit={() => handleOpenEdit(team)}
                onDelete={() => {
                  if (stats.assignedCount > 0) {
                    setModal({
                      title: 'Cannot delete team',
                      description: `"${team.name}" currently has ${stats.assignedCount} player(s) assigned (${stats.soldCount} purchased). You must reassign or remove all players before deleting this club.`,
                      confirmText: 'Understood',
                      onConfirm: () => setModal(null),
                    });
                    return;
                  }

                  setModal({
                    title: `Delete "${team.name}"?`,
                    description: `This permanently deletes the club's record, purse settings, and branding logo from the auction tournament. This action cannot be undone.`,
                    confirmText: 'Delete club',
                    cancelText: 'Cancel',
                    isDanger: true,
                    onConfirm: async () => {
                      setModalPending(true);
                      try {
                        const err = await deleteTeam(team.id);
                        if (err) {
                          triggerToast(err, true);
                        } else {
                          triggerToast(`"${team.name}" removed from tournament.`);
                          if (editing && typeof editing === 'object' && editing.id === team.id) {
                            setEditing(null);
                          }
                          setModal(null);
                        }
                      } finally {
                        setModalPending(false);
                      }
                    },
                  });
                }}
              />
            );
          })}

          {/* Add Team Tile inside the directory grid */}
          {!query && editing === null && (
            <aside className="manage-add-tile">
              <div>
                <div className="manage-tile-kicker">NEXT UP / NEW CLUB</div>
                <h3 className="manage-tile-title">Bring a club in.</h3>
                <p className="manage-tile-desc">Add a team, set its purse and give it an official crest.</p>
              </div>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="manage-add-tile-button"
              >
                <IconPlus />
                <span>+ ADD TEAM</span>
                <IconArrow />
              </button>
            </aside>
          )}
        </div>
      ) : (
        <EmptyState
          title={query ? 'No matching clubs' : 'No clubs registered'}
          description={
            query
              ? `No registered clubs match "${search}". Try searching for another name.`
              : 'There are no clubs registered yet. Start by adding your first team.'
          }
          className="my-6"
          action={
            <button
              type="button"
              className="manage-add-primary"
              onClick={() => {
                if (query) setSearch('');
                else handleOpenAdd();
              }}
            >
              {query ? 'Clear search' : '+ Add your first team'}
            </button>
          }
        />
      )}

      {/* ── Footer Note ── */}
      <div className="manage-preview-note">
        <strong>Tournament Clubhouse</strong>
        <span>
          Team rosters, initial purses, and official logos are saved live to the Supabase tournament database and stream directly to the auction room and public projector.
        </span>
      </div>

      {/* ── Neo-Brutalist Confirmation / Alert Modal ── */}
      {modal && (
        <ConfirmDialog
          isOpen={true}
          eyebrow={`${tournamentName ? tournamentName.toUpperCase() + ' · ' : ''}CLUB MANAGEMENT`}
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

      {/* ── Toast Notification ── */}
      <Toast
        message={toastMessage?.text ?? null}
        isError={toastMessage?.isError}
        onDismiss={() => setToastMessage(null)}
      />
    </div>
  );
}

/* ── Team Directory Card ── */
function TeamCard({
  team,
  index,
  stats,
  tournamentName,
  onEdit,
  onDelete,
}: {
  team: Team;
  index: number;
  stats: TeamStatsSummary;
  tournamentName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasAssignedPlayers = stats.assignedCount > 0;
  const padIndex = String(index + 1).padStart(2, '0');

  return (
    <article className="manage-card" data-team-id={team.id}>
      <div className="manage-card-top">
        <span className="font-extrabold tracking-wider">CLUB {padIndex}</span>
        <span className="truncate max-w-[130px]">{tournamentName}</span>
      </div>

      <div className="manage-card-body">
        <TeamCrest logoUrl={team.logo_url} name={team.name} />

        <div className="manage-card-copy">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="manage-card-name" title={team.name}>
              {team.name}
            </h3>
            {stats.soldCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                {stats.soldCount} {stats.soldCount === 1 ? 'BUY' : 'BUYS'}
              </span>
            )}
          </div>

          <span className="manage-card-purse-label">Team purse</span>
          <strong className="manage-card-purse">
            ₹{team.purse_total.toLocaleString('en-IN')}
          </strong>

          {stats.spent > 0 && (
            <div className="mt-1 text-[10px] text-slate-600 font-semibold leading-tight">
              <span>Spent: ₹{stats.spent.toLocaleString('en-IN')}</span>
              {' · '}
              <span className="text-emerald-700 font-bold">
                Rem: ₹{(team.purse_total - stats.spent).toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="manage-card-actions">
        <button
          type="button"
          onClick={onEdit}
          className="manage-card-edit"
          aria-label={`Edit ${team.name}`}
        >
          <IconEdit />
          <span>EDIT TEAM</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={hasAssignedPlayers}
          title={
            hasAssignedPlayers
              ? `Cannot delete team with ${stats.assignedCount} assigned player(s)`
              : `Delete ${team.name}`
          }
          className="manage-card-delete"
          aria-label={`Delete ${team.name}`}
        >
          <IconTrash />
          <span>DELETE</span>
        </button>
      </div>
    </article>
  );
}

/* ── Team Form Panel (Add & Edit) ── */
function TeamFormPanel({
  editing,
  settings,
  stats,
  onDone,
  onCancel,
}: {
  editing: Team | 'new';
  settings: Settings | null;
  stats?: TeamStatsSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isNew = editing === 'new';
  const team = isNew ? null : editing;

  const [nameValue, setNameValue] = useState<string>(team?.name ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(team?.logo_url ?? null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [logoFileName, setLogoFileName] = useState<string>('');
  const [isLogoRemoved, setIsLogoRemoved] = useState<boolean>(false);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultPurse = settings?.default_purse ?? 10000;
  const granularity = settings?.bid_granularity ?? 50;

  const initialPurse = team ? team.purse_total : defaultPurse;
  const [purseValue, setPurseValue] = useState<number | string>(initialPurse);

  const totalSpent = stats?.spent ?? 0;
  const soldCount = stats?.soldCount ?? 0;
  const hasSoldPlayers = Boolean(team && soldCount > 0);

  const [showPurseConfirm, setShowPurseConfirm] = useState(false);
  const [isPurseConfirmed, setIsPurseConfirmed] = useState(false);
  const formElementRef = useRef<HTMLFormElement | null>(null);

  const [serverError, formAction, pending] = useActionState(
    async (prev: string | null, formData: FormData) => {
      setClientError(null);
      const enteredPurse = Number(formData.get('purse_total'));

      if (isNaN(enteredPurse) || enteredPurse <= 0) {
        return 'Purse must be a positive number.';
      }

      if (hasSoldPlayers && enteredPurse < totalSpent) {
        return `Purse cannot be lower than what the team has already spent (₹${totalSpent.toLocaleString('en-IN')}).`;
      }

      if (granularity > 0 && enteredPurse % granularity !== 0) {
        return `Purse ₹${enteredPurse.toLocaleString('en-IN')} must be a multiple of bid granularity (₹${granularity}).`;
      }

      if (logoBlob) {
        formData.set('logo_file', logoBlob, logoFileName);
      }
      if (isLogoRemoved) {
        formData.set('remove_logo', 'true');
      }

      const result = await upsertTeam(prev, formData);
      if (!result) {
        onDone();
      }
      return result;
    },
    null,
  );

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setClientError('Please choose a valid image file (PNG, JPG, or WebP).');
      return;
    }

    try {
      setIsProcessingImage(true);
      const { blob, fileName } = await resizeImageToWebP(file, 800, 0.85);
      setLogoBlob(blob);
      setLogoFileName(fileName);
      setPreviewUrl(URL.createObjectURL(blob));
      setIsLogoRemoved(false);
    } catch (err: unknown) {
      setClientError(err instanceof Error ? err.message : 'Error converting image to WebP');
    } finally {
      setIsProcessingImage(false);
    }
  }

  function handleRemoveLogo() {
    setPreviewUrl(null);
    setLogoBlob(null);
    setLogoFileName('');
    setIsLogoRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setClientError(null);
  }

  const numPurse = Number(purseValue);
  const isPurseBelowSpent = hasSoldPlayers && !isNaN(numPurse) && numPurse < totalSpent;
  const isPurseNotMultiple =
    granularity > 0 && !isNaN(numPurse) && numPurse > 0 && numPurse % granularity !== 0;

  return (
    <>
      <div className="manage-form-head">
        <span className="manage-form-number">
          {isNew ? <IconPlus /> : <IconEdit />}
        </span>
        <div className="manage-form-head-copy">
          <h2 id="manageFormTitle">
            {isNew || !team ? 'Add new team' : `Edit team: ${team.name}`}
          </h2>
          <p id="manageFormSubtitle">
            {isNew
              ? 'Give your new club a name, starting purse and official crest.'
              : 'Update this club’s details, total purse and official crest.'}
          </p>
        </div>
        <span className="manage-form-tag">
          {isNew ? 'NEW CLUB' : 'EDIT CLUB'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="manage-form-close"
          aria-label="Close team form"
        >
          <IconClose />
        </button>
      </div>

      {/* Warning banner when team already has sold players */}
      {hasSoldPlayers && (
        <div className="mx-4 mt-4 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-none text-xs text-amber-950 space-y-1">
          <p className="font-extrabold flex items-center gap-1.5 uppercase tracking-wider text-amber-900">
            <span>⚠️</span> Active Purchases Warning
          </p>
          <p>
            This team has already acquired <strong>{soldCount} player(s)</strong> and spent{' '}
            <strong className="font-mono text-emerald-800">
              ₹{totalSpent.toLocaleString('en-IN')}
            </strong>
            .
          </p>
          <p className="text-amber-800">
            Any purse revision must be at least{' '}
            <strong className="font-mono">₹{totalSpent.toLocaleString('en-IN')}</strong> and a
            multiple of <strong className="font-mono">₹{granularity}</strong>.
          </p>
        </div>
      )}

      <form
        ref={formElementRef}
        action={formAction}
        onSubmit={(e) => {
          const entered = Number(purseValue);
          if (hasSoldPlayers && team && entered !== team.purse_total && !isPurseConfirmed) {
            e.preventDefault();
            setShowPurseConfirm(true);
          }
        }}
        noValidate
      >
        {team && <input type="hidden" name="id" value={team.id} />}

        <div className="manage-form-grid">
          {/* Field 1: Name */}
          <div className="manage-field">
            <label className="manage-field-label" htmlFor="manageTeamName">
              Team name <span aria-hidden="true">*</span>
            </label>
            <div className="manage-field-control">
              <input
                id="manageTeamName"
                name="name"
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="e.g. Thunderbolts FC"
                required
                autoComplete="off"
              />
            </div>
            <p className="manage-field-help">The name displayed across the tournament and auction.</p>
          </div>

          {/* Field 2: Purse */}
          <div className={`manage-field ${isPurseBelowSpent || isPurseNotMultiple ? 'invalid' : ''}`}>
            <label className="manage-field-label" htmlFor="managePurse">
              Purse total (₹) <span aria-hidden="true">*</span>
            </label>
            <div className="manage-field-control">
              <span className="manage-prefix" aria-hidden="true">
                ₹
              </span>
              <input
                id="managePurse"
                name="purse_total"
                type="number"
                value={purseValue}
                onChange={(e) => {
                  setPurseValue(e.target.value);
                  setIsPurseConfirmed(false);
                }}
                min={hasSoldPlayers ? totalSpent : 0}
                step={granularity || 'any'}
                required
                inputMode="numeric"
              />
            </div>
            <p className="manage-field-help">
              {team
                ? `Must be a multiple of ₹${granularity}${hasSoldPlayers ? ` and at least ₹${totalSpent.toLocaleString('en-IN')}` : ''}.`
                : `Prefilled with ₹${defaultPurse.toLocaleString('en-IN')}. Must be a multiple of ₹${granularity}.`}
            </p>
            {isPurseBelowSpent && (
              <span className="manage-field-error">
                Cannot be lower than ₹{totalSpent.toLocaleString('en-IN')} already spent by this team.
              </span>
            )}
            {isPurseNotMultiple && (
              <span className="manage-field-error">
                Must be a multiple of ₹{granularity}.
              </span>
            )}
          </div>

          {/* Field 3: Team Logo Upload */}
          <div className="manage-logo-field">
            <div className="manage-field-label">Team logo</div>
            <div className="manage-logo-picker">
              <div className="manage-crest" aria-label="Team logo preview">
                {previewUrl ? (
                  <ImageWithFallback
                    src={previewUrl}
                    alt="Logo preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <>
                    <svg className="placeholder-shield" viewBox="0 0 72 80" aria-hidden="true">
                      <path d="M5 4h62v37c0 17-11 28-31 36C16 69 5 58 5 41Z" fill="#0a174f" />
                      <path d="M10 9h52v32c0 14-9 24-26 31C19 65 10 55 10 41Z" fill="#1947f4" />
                      <path d="M10 47 48 9h14v17L20 68c-4-5-8-12-10-21Z" fill="#365eff" />
                      <path d="M16 57h40" stroke="#efff00" strokeWidth="3" />
                    </svg>
                    <span className="placeholder-initials">
                      {getTeamInitials(nameValue || 'Team')}
                    </span>
                  </>
                )}
              </div>

              <div className="manage-logo-copy">
                <p className="manage-logo-title">
                  {previewUrl ? 'Selected crest' : 'Add a club crest'}
                </p>
                <p className="manage-logo-help">
                  Resized in browser to max 800 px and converted to WebP. Stored in public Supabase bucket.
                </p>
                <div className="manage-logo-actions">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingImage}
                    className="manage-logo-action"
                  >
                    {isProcessingImage
                      ? 'Processing…'
                      : previewUrl
                        ? 'Replace logo ↗'
                        : 'Choose logo ↗'}
                  </button>

                  {previewUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={isProcessingImage}
                      className="manage-logo-action remove"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/*"
                  onChange={handleLogoSelect}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choose team logo"
                />
              </div>
            </div>

            {clientError && (
              <p className="manage-logo-feedback error" role="status">
                {clientError}
              </p>
            )}
          </div>
        </div>

        {serverError && (
          <div className="mx-4 mb-2 p-3 bg-red-50 border-2 border-red-300 text-red-700 text-xs font-bold">
            {serverError}
          </div>
        )}

        {/* Footer with actions */}
        <div className="manage-form-bottom">
          <div className="manage-form-note">
            Saved directly to your live tournament database. Crests are converted in-browser to WebP.
          </div>
          <div className="manage-form-actions">
            <button
              type="button"
              onClick={onCancel}
              className="manage-form-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || isProcessingImage || isPurseBelowSpent || isPurseNotMultiple}
              className="manage-form-submit"
            >
              <span>
                {pending
                  ? 'Saving…'
                  : isProcessingImage
                    ? 'Processing crest…'
                    : isNew
                      ? 'Add team'
                      : 'Save changes'}
              </span>
              <IconArrow />
            </button>
          </div>
        </div>
      </form>

      {/* Confirmation modal for changing purse after players have been bought */}
      <ConfirmDialog
        isOpen={showPurseConfirm}
        eyebrow="CONFIRM PURSE CHANGE"
        title="Change Team Purse?"
        description={
          <div>
            <p className="mb-2">
              Team <strong>&quot;{team?.name}&quot;</strong> has already spent ₹{totalSpent.toLocaleString('en-IN')} on {soldCount} player(s).
            </p>
            <p>
              Are you sure you want to change its total purse from <strong>₹{team?.purse_total.toLocaleString('en-IN')}</strong> to <strong>₹{Number(purseValue).toLocaleString('en-IN')}</strong>?
            </p>
          </div>
        }
        confirmText="Confirm Purse Change"
        cancelText="Cancel"
        onConfirm={() => {
          setIsPurseConfirmed(true);
          setShowPurseConfirm(false);
          setTimeout(() => {
            formElementRef.current?.requestSubmit();
          }, 50);
        }}
        onClose={() => setShowPurseConfirm(false)}
      />
    </>
  );
}

/* ── Crest Renderer Component ── */
function TeamCrest({
  logoUrl,
  name,
}: {
  logoUrl?: string | null;
  name: string;
}) {
  const initials = getTeamInitials(name || 'Team');

  return (
    <div className="manage-crest" aria-label={`${name} crest`}>
      {logoUrl ? (
        <ImageWithFallback
          src={logoUrl}
          alt={`${name} crest`}
          className="w-full h-full object-contain"
          fallbackIcon={
            <>
              <svg className="placeholder-shield" viewBox="0 0 72 80" aria-hidden="true">
                <path d="M5 4h62v37c0 17-11 28-31 36C16 69 5 58 5 41Z" fill="#0a174f" />
                <path d="M10 9h52v32c0 14-9 24-26 31C19 65 10 55 10 41Z" fill="#1947f4" />
                <path d="M10 47 48 9h14v17L20 68c-4-5-8-12-10-21Z" fill="#365eff" />
                <path d="M16 57h40" stroke="#efff00" strokeWidth="3" />
              </svg>
              <span className="placeholder-initials">{initials}</span>
            </>
          }
        />
      ) : (
        <>
          <svg className="placeholder-shield" viewBox="0 0 72 80" aria-hidden="true">
            <path d="M5 4h62v37c0 17-11 28-31 36C16 69 5 58 5 41Z" fill="#0a174f" />
            <path d="M10 9h52v32c0 14-9 24-26 31C19 65 10 55 10 41Z" fill="#1947f4" />
            <path d="M10 47 48 9h14v17L20 68c-4-5-8-12-10-21Z" fill="#365eff" />
            <path d="M16 57h40" stroke="#efff00" strokeWidth="3" />
          </svg>
          <span className="placeholder-initials">{initials}</span>
        </>
      )}
    </div>
  );
}

/* ── SVG Icons ── */
function IconArrow() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="10.5" cy="10.5" r="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m15.5 15.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="m4 16-.5 4.5L8 20 19.5 8.5 15.5 4.5 4 16ZM13.5 6.5l4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
