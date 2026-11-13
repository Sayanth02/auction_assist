'use client';

import React, { useState, useRef, useTransition } from 'react';
import { saveSettings } from '@/app/actions/settings';
import type { Settings } from '@/lib/supabase/types';

interface SettingsFormProps {
  settings: Settings | null;
}

interface FormSettingsState {
  tournamentName: string;
  defaultPurse: number | string;
  defaultBase: number | string;
  minSquad: number | string;
  maxSquad: number | string;
  minBase: number | string;
  playerOrder: string;
  minIncrement: number | string;
  granularity: number | string;
  allowBase: boolean;
  logo: string | null;
}

export default function SettingsForm({ settings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();

  const s = settings;
  const initialValues: FormSettingsState = {
    tournamentName: s?.tournament_name ?? 'VSL SEASON 4',
    defaultPurse: s?.default_purse ?? 10000,
    defaultBase: s?.default_base_price ?? 100,
    minSquad: s?.min_squad ?? 6,
    maxSquad: s?.max_squad ?? 6,
    minBase: s?.min_base_price ?? 100,
    playerOrder: s?.order_mode ?? 'random',
    minIncrement: s?.increment_rules?.[0]?.step ?? 50,
    granularity: s?.bid_granularity ?? 50,
    allowBase: s?.allow_base_price_bid ?? true,
    logo: s?.logo_url ?? null,
  };

  // Controlled form states
  const [tournamentName, setTournamentName] = useState<string>(initialValues.tournamentName);
  const [defaultPurse, setDefaultPurse] = useState<number | string>(initialValues.defaultPurse);
  const [defaultBase, setDefaultBase] = useState<number | string>(initialValues.defaultBase);
  const [minSquad, setMinSquad] = useState<number | string>(initialValues.minSquad);
  const [maxSquad, setMaxSquad] = useState<number | string>(initialValues.maxSquad);
  const [minBase, setMinBase] = useState<number | string>(initialValues.minBase);
  const [playerOrder, setPlayerOrder] = useState<string>(initialValues.playerOrder);
  const [minIncrement, setMinIncrement] = useState<number | string>(initialValues.minIncrement);
  const [granularity, setGranularity] = useState<number | string>(initialValues.granularity);
  const [allowBasePriceBid, setAllowBasePriceBid] = useState<boolean>(initialValues.allowBase);

  // Logo states
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialValues.logo);
  const [isRemoved, setIsRemoved] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  // Baseline saved state
  const [saved, setSaved] = useState<FormSettingsState>(initialValues);
  const [hasSaved, setHasSaved] = useState<boolean>(false);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Toast notification
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function showToast(message: string, isError = false) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, isError });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }

  // Dirty detection
  const isDirty =
    tournamentName !== saved.tournamentName ||
    Number(defaultPurse) !== Number(saved.defaultPurse) ||
    Number(defaultBase) !== Number(saved.defaultBase) ||
    Number(minSquad) !== Number(saved.minSquad) ||
    Number(maxSquad) !== Number(saved.maxSquad) ||
    Number(minBase) !== Number(saved.minBase) ||
    playerOrder !== saved.playerOrder ||
    Number(minIncrement) !== Number(saved.minIncrement) ||
    Number(granularity) !== Number(saved.granularity) ||
    allowBasePriceBid !== saved.allowBase ||
    previewUrl !== saved.logo ||
    isRemoved;

  // Currency helper
  const displayMoney = (val: number | string) => {
    const raw = String(val).trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) && n >= 0 ? '₹' + n.toLocaleString('en-IN') : '—';
  };

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      const msg = 'Choose a PNG, JPG or WebP image.';
      setUploadFeedback(msg);
      showToast(msg, true);
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      const msg = 'The logo must be 2 MB or smaller.';
      setUploadFeedback(msg);
      showToast(msg, true);
      e.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsRemoved(false);
    setUploadFeedback(null);
    showToast('Logo selected. Save settings to apply.');
  }

  function handleRemoveLogo() {
    setPreviewUrl(null);
    setIsRemoved(true);
    setUploadFeedback(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Logo removed. Save settings to apply.');
  }

  function handleDiscard() {
    setTournamentName(saved.tournamentName);
    setDefaultPurse(saved.defaultPurse);
    setDefaultBase(saved.defaultBase);
    setMinSquad(saved.minSquad);
    setMaxSquad(saved.maxSquad);
    setMinBase(saved.minBase);
    setPlayerOrder(saved.playerOrder);
    setMinIncrement(saved.minIncrement);
    setGranularity(saved.granularity);
    setAllowBasePriceBid(saved.allowBase);
    setPreviewUrl(saved.logo);
    setIsRemoved(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadFeedback(null);
    setFieldErrors({});
    showToast('Changes discarded.');
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!tournamentName.trim()) {
      errors.tournamentName = 'Please enter a tournament name.';
    }

    const numFields: Array<{ key: string; val: number | string; lower: number; msg: string }> = [
      { key: 'defaultPurse', val: defaultPurse, lower: 0, msg: 'Enter a non-negative number.' },
      { key: 'defaultBase', val: defaultBase, lower: 0, msg: 'Enter a non-negative number.' },
      { key: 'minSquad', val: minSquad, lower: 0, msg: 'Enter a non-negative number.' },
      { key: 'maxSquad', val: maxSquad, lower: 0, msg: 'Enter a non-negative number.' },
      { key: 'minBase', val: minBase, lower: 0, msg: 'Enter a non-negative number.' },
      { key: 'minIncrement', val: minIncrement, lower: 0.1, msg: 'Enter a number of at least 0.1.' },
      { key: 'granularity', val: granularity, lower: 0.01, msg: 'Enter a number of at least 0.01.' },
    ];

    for (const item of numFields) {
      const raw = String(item.val).trim();
      const n = Number(raw);
      if (raw === '' || isNaN(n) || n < item.lower) {
        errors[item.key] = item.msg;
      }
    }

    if (!errors.minSquad && !errors.maxSquad && Number(minSquad) > Number(maxSquad)) {
      errors.maxSquad = 'Maximum squad size must be at least the minimum.';
    }

    setFieldErrors(errors);

    const firstErrKey = Object.keys(errors)[0];
    if (firstErrKey) {
      const el = document.getElementById(firstErrKey);
      if (el) el.focus();
      return false;
    }

    return true;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) {
      showToast('Please check the highlighted fields.', true);
      return;
    }

    const formEl = e.currentTarget;
    const formData = new FormData(formEl);

    // Overwrite fields to guarantee controlled React state sync
    formData.set('tournament_name', tournamentName.trim());
    formData.set('default_purse', String(defaultPurse));
    formData.set('default_base_price', String(defaultBase));
    formData.set('min_squad', String(minSquad));
    formData.set('max_squad', String(maxSquad));
    formData.set('min_base_price', String(minBase));
    formData.set('order_mode', playerOrder);
    formData.set('min_bid_increment', String(minIncrement));
    formData.set('bid_granularity', String(granularity));
    formData.set('allow_base_price_bid', allowBasePriceBid ? 'true' : 'false');
    formData.set('remove_logo', isRemoved ? 'true' : 'false');

    startTransition(async () => {
      const errorMsg = await saveSettings(null, formData);
      if (errorMsg) {
        showToast(errorMsg, true);
      } else {
        const newSaved = {
          tournamentName: tournamentName.trim(),
          defaultPurse,
          defaultBase,
          minSquad,
          maxSquad,
          minBase,
          playerOrder,
          minIncrement,
          granularity,
          allowBase: allowBasePriceBid,
          logo: isRemoved ? null : previewUrl,
        };
        setSaved(newSaved);
        setHasSaved(true);
        setIsRemoved(false);
        showToast('Tournament settings saved successfully.');
      }
    });
  }

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <>
      <div className="settings-layout">
        {/* LEFT COLUMN: THE THREE PANELS & SAVE STRIP */}
        <form className="settings-form" id="settingsForm" noValidate onSubmit={handleSubmit}>
          {/* PANEL 01: TOURNAMENT IDENTITY */}
          <section className="settings-panel" aria-labelledby="identityHeading">
            <div className="panel-heading">
              <span className="panel-number">01</span>
              <div>
                <h2 className="panel-title" id="identityHeading">Tournament identity</h2>
                <p className="panel-subtitle">Make it yours before the auction begins.</p>
              </div>
              <span className="panel-tag">THE BASICS</span>
            </div>
            <div className="panel-body identity-body">
              {/* Tournament Name Field */}
              <div
                className={`form-field ${fieldErrors.tournamentName ? 'invalid' : ''}`}
                data-field="tournamentName"
              >
                <label className="form-label" htmlFor="tournamentName">
                  Tournament name
                </label>
                <div className="form-control">
                  <input
                    id="tournamentName"
                    name="tournament_name"
                    type="text"
                    value={tournamentName}
                    onChange={(e) => {
                      setTournamentName(e.target.value);
                      clearFieldError('tournamentName');
                    }}
                    required
                    autoComplete="off"
                    aria-describedby="tournamentNameHelp tournamentNameError"
                    aria-invalid={!!fieldErrors.tournamentName}
                  />
                </div>
                <p className="field-help" id="tournamentNameHelp">
                  The name displayed across your tournament.
                </p>
                {fieldErrors.tournamentName && (
                  <span className="field-error" id="tournamentNameError">
                    {fieldErrors.tournamentName}
                  </span>
                )}
              </div>

              {/* Tournament Logo Field */}
              <div className="logo-field">
                <div className="form-label">Tournament logo</div>
                <div className="logo-row">
                  <div className="logo-thumb">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        id="logoPreview"
                        src={previewUrl}
                        alt="Tournament logo preview"
                      />
                    ) : (
                      <span className="logo-empty" id="logoEmpty">
                        NO<br />LOGO
                      </span>
                    )}
                  </div>
                  <div className="logo-info">
                    <p className="logo-title" id="logoTitle">
                      {previewUrl ? 'Current tournament logo' : 'No logo selected'}
                    </p>
                    <p className="logo-note">PNG, JPG or WebP · max 2 MB</p>
                    <div className="logo-actions">
                      <button
                        type="button"
                        className="upload-btn"
                        id="chooseLogo"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {previewUrl ? 'Replace logo ↗' : 'Upload logo ↗'}
                      </button>
                      <button
                        type="button"
                        className="remove-logo"
                        id="removeLogo"
                        onClick={handleRemoveLogo}
                        disabled={!previewUrl}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      id="logoFile"
                      name="logo_file"
                      accept="image/png,image/jpeg,image/webp"
                      tabIndex={-1}
                      aria-label="Choose tournament logo"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
                {uploadFeedback && (
                  <div className="upload-feedback" id="uploadFeedback" role="alert">
                    {uploadFeedback}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* PANEL 02: SQUAD & PURSE DEFAULTS */}
          <section className="settings-panel" aria-labelledby="squadHeading">
            <div className="panel-heading">
              <span className="panel-number">02</span>
              <div>
                <h2 className="panel-title" id="squadHeading">Squad &amp; purse defaults</h2>
                <p className="panel-subtitle">Define the starting budget and squad rules.</p>
              </div>
              <span className="panel-tag">BUILD THE SQUAD</span>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                {/* Default Team Purse */}
                <div
                  className={`form-field ${fieldErrors.defaultPurse ? 'invalid' : ''}`}
                  data-field="defaultPurse"
                >
                  <label className="form-label" htmlFor="defaultPurse">
                    Default team purse
                  </label>
                  <div className="form-control">
                    <span className="currency-prefix" aria-hidden="true">₹</span>
                    <input
                      id="defaultPurse"
                      name="default_purse"
                      type="number"
                      value={defaultPurse}
                      onChange={(e) => {
                        setDefaultPurse(e.target.value);
                        clearFieldError('defaultPurse');
                      }}
                      min="0"
                      step="1"
                      required
                      inputMode="numeric"
                      aria-describedby="defaultPurseHelp defaultPurseError"
                      aria-invalid={!!fieldErrors.defaultPurse}
                    />
                  </div>
                  <p className="field-help" id="defaultPurseHelp">
                    Starting purse allocated to new teams.
                  </p>
                  {fieldErrors.defaultPurse && (
                    <span className="field-error" id="defaultPurseError">
                      {fieldErrors.defaultPurse}
                    </span>
                  )}
                </div>

                {/* Default Base Price */}
                <div
                  className={`form-field ${fieldErrors.defaultBase ? 'invalid' : ''}`}
                  data-field="defaultBase"
                >
                  <label className="form-label" htmlFor="defaultBase">
                    Default base price
                  </label>
                  <div className="form-control">
                    <span className="currency-prefix" aria-hidden="true">₹</span>
                    <input
                      id="defaultBase"
                      name="default_base_price"
                      type="number"
                      value={defaultBase}
                      onChange={(e) => {
                        setDefaultBase(e.target.value);
                        clearFieldError('defaultBase');
                      }}
                      min="0"
                      step="1"
                      required
                      inputMode="numeric"
                      aria-describedby="defaultBaseHelp defaultBaseError"
                      aria-invalid={!!fieldErrors.defaultBase}
                    />
                  </div>
                  <p className="field-help" id="defaultBaseHelp">
                    Initial opening price for new players.
                  </p>
                  {fieldErrors.defaultBase && (
                    <span className="field-error" id="defaultBaseError">
                      {fieldErrors.defaultBase}
                    </span>
                  )}
                </div>

                {/* Min Squad Size */}
                <div
                  className={`form-field ${fieldErrors.minSquad ? 'invalid' : ''}`}
                  data-field="minSquad"
                >
                  <label className="form-label" htmlFor="minSquad">
                    Min squad size
                  </label>
                  <div className="form-control">
                    <input
                      id="minSquad"
                      name="min_squad"
                      type="number"
                      value={minSquad}
                      onChange={(e) => {
                        setMinSquad(e.target.value);
                        clearFieldError('minSquad');
                      }}
                      min="0"
                      step="1"
                      required
                      inputMode="numeric"
                      aria-describedby="minSquadHelp minSquadError"
                      aria-invalid={!!fieldErrors.minSquad}
                    />
                  </div>
                  <p className="field-help" id="minSquadHelp">
                    Enforces reserve purse for remaining slots.
                  </p>
                  {fieldErrors.minSquad && (
                    <span className="field-error" id="minSquadError">
                      {fieldErrors.minSquad}
                    </span>
                  )}
                </div>

                {/* Max Squad Size */}
                <div
                  className={`form-field ${fieldErrors.maxSquad ? 'invalid' : ''}`}
                  data-field="maxSquad"
                >
                  <label className="form-label" htmlFor="maxSquad">
                    Max squad size
                  </label>
                  <div className="form-control">
                    <input
                      id="maxSquad"
                      name="max_squad"
                      type="number"
                      value={maxSquad}
                      onChange={(e) => {
                        setMaxSquad(e.target.value);
                        clearFieldError('maxSquad');
                      }}
                      min="0"
                      step="1"
                      required
                      inputMode="numeric"
                      aria-describedby="maxSquadHelp maxSquadError"
                      aria-invalid={!!fieldErrors.maxSquad}
                    />
                  </div>
                  <p className="field-help" id="maxSquadHelp">
                    Teams cannot buy players beyond this limit.
                  </p>
                  {fieldErrors.maxSquad && (
                    <span className="field-error" id="maxSquadError">
                      {fieldErrors.maxSquad}
                    </span>
                  )}
                </div>

                {/* Min Base Price */}
                <div
                  className={`form-field ${fieldErrors.minBase ? 'invalid' : ''}`}
                  data-field="minBase"
                >
                  <label className="form-label" htmlFor="minBase">
                    Min base price
                  </label>
                  <div className="form-control">
                    <span className="currency-prefix" aria-hidden="true">₹</span>
                    <input
                      id="minBase"
                      name="min_base_price"
                      type="number"
                      value={minBase}
                      onChange={(e) => {
                        setMinBase(e.target.value);
                        clearFieldError('minBase');
                      }}
                      min="0"
                      step="1"
                      required
                      inputMode="numeric"
                      aria-describedby="minBaseHelp minBaseError"
                      aria-invalid={!!fieldErrors.minBase}
                    />
                  </div>
                  <p className="field-help" id="minBaseHelp">
                    Floor used in the reserve purse formula.
                  </p>
                  {fieldErrors.minBase && (
                    <span className="field-error" id="minBaseError">
                      {fieldErrors.minBase}
                    </span>
                  )}
                </div>

                {/* Player Order Mode */}
                <div className="form-field" data-field="playerOrder">
                  <label className="form-label" htmlFor="playerOrder">
                    Player order mode
                  </label>
                  <div className="form-control select-wrap">
                    <select
                      id="playerOrder"
                      name="order_mode"
                      value={playerOrder}
                      onChange={(e) => setPlayerOrder(e.target.value)}
                      aria-describedby="playerOrderHelp"
                    >
                      <option value="random">Random next (system picks random player)</option>
                      <option value="manual">Manual pick (auctioneer selects player)</option>
                    </select>
                  </div>
                  <p className="field-help" id="playerOrderHelp">
                    The system picks a random player for the next auction.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* PANEL 03: BID INCREMENT & GRANULARITY */}
          <section className="settings-panel" aria-labelledby="bidHeading">
            <div className="panel-heading">
              <span className="panel-number">03</span>
              <div>
                <h2 className="panel-title" id="bidHeading">Bid increment &amp; granularity</h2>
                <p className="panel-subtitle">Keep every bid on the right step.</p>
              </div>
              <span className="panel-tag">BID RULES</span>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                {/* Minimum Bid Increment */}
                <div
                  className={`form-field ${fieldErrors.minIncrement ? 'invalid' : ''}`}
                  data-field="minIncrement"
                >
                  <label className="form-label" htmlFor="minIncrement">
                    Minimum bid increment
                  </label>
                  <div className="form-control">
                    <span className="currency-prefix" aria-hidden="true">₹</span>
                    <input
                      id="minIncrement"
                      name="min_bid_increment"
                      type="number"
                      value={minIncrement}
                      onChange={(e) => {
                        setMinIncrement(e.target.value);
                        clearFieldError('minIncrement');
                      }}
                      min="0.1"
                      step="any"
                      required
                      inputMode="numeric"
                      aria-describedby="minIncrementHelp minIncrementError"
                      aria-invalid={!!fieldErrors.minIncrement}
                    />
                  </div>
                  <p className="field-help" id="minIncrementHelp">
                    Minimum amount each bid must increase by.
                  </p>
                  {fieldErrors.minIncrement && (
                    <span className="field-error" id="minIncrementError">
                      {fieldErrors.minIncrement}
                    </span>
                  )}
                </div>

                {/* Bid Granularity */}
                <div
                  className={`form-field ${fieldErrors.granularity ? 'invalid' : ''}`}
                  data-field="granularity"
                >
                  <label className="form-label" htmlFor="granularity">
                    Bid granularity
                  </label>
                  <div className="form-control">
                    <span className="currency-prefix" aria-hidden="true">₹</span>
                    <input
                      id="granularity"
                      name="bid_granularity"
                      type="number"
                      value={granularity}
                      onChange={(e) => {
                        setGranularity(e.target.value);
                        clearFieldError('granularity');
                      }}
                      min="0.01"
                      step="any"
                      required
                      inputMode="numeric"
                      aria-describedby="granularityHelp granularityError"
                      aria-invalid={!!fieldErrors.granularity}
                    />
                  </div>
                  <p className="field-help" id="granularityHelp">
                    Bids must be multiples of this value (e.g. ₹5 allows ₹150, ₹155 or ₹500).
                  </p>
                  {fieldErrors.granularity && (
                    <span className="field-error" id="granularityError">
                      {fieldErrors.granularity}
                    </span>
                  )}
                </div>
              </div>

              {/* Checkbox: Allow opening bid at base price */}
              <label className="check-row" htmlFor="allowBase">
                <input
                  id="allowBase"
                  name="allow_base_price_bid"
                  type="checkbox"
                  checked={allowBasePriceBid}
                  onChange={(e) => setAllowBasePriceBid(e.target.checked)}
                />
                <span className="check-copy">
                  <strong>Allow opening bid at base price</strong>
                  <small>If checked, the first bid on a player can match their base price exactly.</small>
                </span>
              </label>
            </div>
          </section>

          {/* SAVE STRIP */}
          <div className="save-strip">
            <div className="save-note">
              <strong id="saveState">
                {isDirty ? 'UNSAVED CHANGES' : hasSaved ? 'SAVED' : 'READY'}
              </strong>
              <span>
                {isDirty
                  ? 'You have unsaved changes in your tournament settings.'
                  : 'Settings are saved and ready for the auction console.'}
              </span>
            </div>
            <div className="save-actions">
              <button
                className="discard-btn"
                id="discardChanges"
                type="button"
                onClick={handleDiscard}
                disabled={!isDirty || isPending}
              >
                Discard changes
              </button>
              <button
                className="save-btn"
                type="submit"
                disabled={isPending}
              >
                {isPending ? 'Saving settings…' : 'Save settings'}
                <svg
                  className="icon w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </form>

        {/* RIGHT COLUMN: LIVE CONTROL CENTRE SUMMARY & PREVIEW */}
        <aside className="settings-aside" aria-label="Settings summary">
          <div className="settings-summary">
            <div className="summary-head">
              <div className="summary-kicker">Control centre / live preview</div>
              <h2 className="summary-title">Your tournament</h2>
            </div>
            <div className="summary-body">
              {/* Live Identity Row */}
              <div className="summary-identity">
                <div className="summary-logo">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      id="summaryLogo"
                      src={previewUrl}
                      alt="Tournament logo"
                    />
                  ) : (
                    <span className="logo-empty" id="summaryLogoEmpty">
                      NO<br />LOGO
                    </span>
                  )}
                </div>
                <div className="summary-name-wrap">
                  <small>Tournament</small>
                  <h3 className="summary-name" id="summaryName">
                    {tournamentName.trim() || 'TOURNAMENT NAME'}
                  </h3>
                </div>
              </div>

              {/* Four Stat Boxes */}
              <div className="summary-stats">
                <div className="summary-stat">
                  <small>Team purse</small>
                  <strong id="summaryPurse">{displayMoney(defaultPurse)}</strong>
                </div>
                <div className="summary-stat">
                  <small>Base price</small>
                  <strong id="summaryBase">{displayMoney(defaultBase)}</strong>
                </div>
                <div className="summary-stat">
                  <small>Squad range</small>
                  <strong id="summarySquad">
                    {minSquad !== '' ? minSquad : '—'} – {maxSquad !== '' ? maxSquad : '—'}
                  </strong>
                </div>
                <div className="summary-stat">
                  <small>Bid increment</small>
                  <strong id="summaryIncrement">{displayMoney(minIncrement)}</strong>
                </div>
              </div>

              {/* Rules List */}
              <div className="summary-rules">
                <div className="summary-rule">
                  <span>Minimum base price</span>
                  <strong id="summaryMinBase">{displayMoney(minBase)}</strong>
                </div>
                <div className="summary-rule">
                  <span>Bid granularity</span>
                  <strong id="summaryGranularity">{displayMoney(granularity)}</strong>
                </div>
                <div className="summary-rule">
                  <span>Player order</span>
                  <strong id="summaryOrder">
                    {playerOrder === 'random' ? 'RANDOM NEXT' : 'MANUAL PICK'}
                  </strong>
                </div>
                <div className="summary-rule">
                  <span>Opening at base</span>
                  <strong id="summaryAllow">
                    {allowBasePriceBid ? 'ALLOWED' : 'NOT ALLOWED'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Preview Card */}
          <div className="preview-card">
            <h3 className="preview-card-title">Live console sync</h3>
            <p>
              Changes saved here take effect immediately in the{' '}
              <strong>Auction Console</strong>, <strong>Projector Screen</strong>, and
              team purse allocations.
            </p>
          </div>
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="footer settings-footer">
        <div>
          <strong>{tournamentName.trim() || 'VSL'}</strong> / CONTROL CENTRE
        </div>
        <div className="footer-note">AUCTION SETTINGS &amp; DEFAULTS</div>
      </footer>

      {/* TOAST NOTIFICATION */}
      <div
        className={`vsl-toast ${toast ? 'show' : ''} ${toast?.isError ? 'error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {toast?.message}
      </div>
    </>
  );
}
