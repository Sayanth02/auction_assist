'use client';

import React, { useState, useTransition, useEffect, useMemo } from 'react';
import {
  startPlayer,
  placeBid,
  markSold,
  markUnsold,
  undoLast,
  resetAuction,
  requeueUnsoldPlayers,
} from '@/app/actions/auction';
import { unsellPlayer } from '@/app/actions/players';
import type {
  AuctionState,
  AuctionTeam,
  BidLog,
  Player,
  Settings,
} from '@/lib/supabase/types';
import { getInitials } from '@/lib/player-constants';

interface Props {
  settings: Settings;
  auctionState: AuctionState;
  currentPlayer: Player | null;
  availablePlayers: Player[];
  unsoldPlayers?: Player[];
  auctionTeams: AuctionTeam[];
  recentLog: BidLog[];
  nextMinBid: number | null;
  playerMap: Record<string, string>;
  teamMap: Record<string, string>;
}

interface JumpConfirmModalState {
  isOpen: boolean;
  team: AuctionTeam | null;
  amount: number;
}

const CREST_PALETTES = [
  { bg: '#0c173b', border: '#e5aa27', text: '#e5aa27' },
  { bg: '#ad202f', border: '#ffffff', text: '#ffffff' },
  { bg: '#0d378f', border: '#ffffff', text: '#ffffff' },
  { bg: '#171923', border: '#f1c335', text: '#f1c335' },
  { bg: '#a52334', border: '#ffffff', text: '#ffffff' },
  { bg: '#087345', border: '#f0c53f', text: '#ffffff' },
  { bg: '#12347b', border: '#f5a229', text: '#ffffff' },
];

function formatTime(isoStr?: string) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function AuctionConsole({
  settings,
  auctionState,
  currentPlayer,
  availablePlayers,
  unsoldPlayers,
  auctionTeams,
  recentLog,
  nextMinBid,
  playerMap,
  teamMap,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const unsoldList = useMemo(() => unsoldPlayers ?? [], [unsoldPlayers]);
  const [selectedPoolTab, setSelectedPoolTab] = useState<'available' | 'unsold' | null>(null);

  // Derive active pool tab: defaults to 'available' if available players exist,
  // automatically falls back to 'unsold' when available pool is empty.
  const poolTab: 'available' | 'unsold' = useMemo(() => {
    if (selectedPoolTab === 'unsold' && unsoldList.length > 0) return 'unsold';
    if (selectedPoolTab === 'available' && availablePlayers.length > 0) return 'available';
    return availablePlayers.length === 0 && unsoldList.length > 0 ? 'unsold' : 'available';
  }, [selectedPoolTab, availablePlayers.length, unsoldList.length]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Modals
  const [jumpModal, setJumpModal] = useState<JumpConfirmModalState>({
    isOpen: false,
    team: null,
    amount: 0,
  });
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [showUnsoldModal, setShowUnsoldModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Track per-team custom jump input values: { [teamId]: string }
  const [teamCustomInputs, setTeamCustomInputs] = useState<Record<string, string>>({});
  const [prevBidKey, setPrevBidKey] = useState(
    `${nextMinBid}-${auctionState.current_bid}-${auctionState.current_player_id}`
  );
  const currentBidKey = `${nextMinBid}-${auctionState.current_bid}-${auctionState.current_player_id}`;

  // Reset custom inputs when player or bid changes during render (React 19 pattern)
  if (prevBidKey !== currentBidKey) {
    setPrevBidKey(currentBidKey);
    setTeamCustomInputs({});
  }

  // Manual player search query when idle
  const [playerSearch, setPlayerSearch] = useState('');

  // Toast auto-dismiss timer
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const isBidding = auctionState.status === 'bidding';
  const hasLeader = !!auctionState.leading_team_id;

  // Find the most recent non-undo action in the activity log
  const lastNonUndo = useMemo(
    () => recentLog.find((l) => l.type !== 'undo') ?? null,
    [recentLog]
  );

  const canUndo = !isPending && recentLog.length > 0 && (
    isBidding ||
    (!isBidding && (lastNonUndo?.type === 'sold' || lastNonUndo?.type === 'unsold'))
  );

  const undoLabel = useMemo(() => {
    if (!isBidding && lastNonUndo) {
      const pName = playerMap[lastNonUndo.player_id];
      if (lastNonUndo.type === 'sold') {
        return pName ? `Undo sale (${pName})` : 'Undo last sale';
      }
      if (lastNonUndo.type === 'unsold') {
        return pName ? `Undo unsold (${pName})` : 'Undo last unsold';
      }
    }
    return hasLeader ? 'Undo last bid' : 'Undo last action';
  }, [isBidding, lastNonUndo, playerMap, hasLeader]);

  const leaderTeam = useMemo(() => {
    if (!auctionState.leading_team_id) return null;
    return (
      auctionTeams.find((t) => t.id === auctionState.leading_team_id) ||
      (teamMap[auctionState.leading_team_id]
        ? ({
            id: auctionState.leading_team_id,
            name: teamMap[auctionState.leading_team_id],
            purse_total: 0,
            created_at: '',
            logo_url: null,
            purse_remaining: 0,
            squad_size: 0,
            max_bid: 0,
            can_bid: false,
          } as AuctionTeam)
        : null)
    );
  }, [auctionState.leading_team_id, auctionTeams, teamMap]);

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
  }

  function run(fn: () => Promise<string | null>, successMsg?: string) {
    startTransition(async () => {
      const err = await fn();
      if (err) {
        showToast(err, true);
      } else if (successMsg) {
        showToast(successMsg);
      }
    });
  }

  /* ── Pick / Randomise player ── */
  function handlePickPlayer(playerId: string) {
    const p = [...availablePlayers, ...unsoldList].find((x) => x.id === playerId);
    run(
      () => startPlayer(playerId),
      p ? `${p.name} called to the block!` : 'Player called to block.'
    );
  }

  function handleRandomPlayer() {
    const pool = availablePlayers.length > 0 ? availablePlayers : unsoldList;
    if (pool.length === 0) {
      showToast('No available or unsold players left in the pool.', true);
      return;
    }
    const idx = Math.floor(Math.random() * pool.length);
    const chosen = pool[idx];
    const isRound2 = availablePlayers.length === 0;
    run(
      () => startPlayer(chosen.id),
      isRound2
        ? `🎲 Round 2: Picked ${chosen.name} from Unsold Pool!`
        : `🎲 Picked ${chosen.name} on the block!`
    );
  }

  function handleRequeueUnsold() {
    if (unsoldList.length === 0) {
      showToast('No unsold players to re-queue.', true);
      return;
    }
    run(
      async () => {
        const res = await requeueUnsoldPlayers();
        return res.error ?? null;
      },
      `Successfully re-queued ${unsoldList.length} unsold player(s) for Round 2!`
    );
  }

  /* ── Bid execution ── */
  function handleBid(teamId: string, amount: number) {
    const t = auctionTeams.find((x) => x.id === teamId);
    run(
      () => placeBid(teamId, amount),
      t ? `${t.name} is leading at ₹${amount.toLocaleString('en-IN')}` : undefined
    );
  }

  /* ── Sold / Unsold / Undo ── */
  function handleConfirmSold() {
    setShowSoldModal(false);
    if (!leaderTeam) {
      showToast('No leading bid to mark sold.', true);
      return;
    }
    const soldPrice = auctionState.current_bid ?? 0;
    run(
      () => markSold(),
      `${currentPlayer?.name || 'Player'} sold to ${leaderTeam.name} for ₹${soldPrice.toLocaleString('en-IN')}!`
    );
  }

  function handleConfirmUnsold() {
    setShowUnsoldModal(false);
    run(
      () => markUnsold(),
      currentPlayer ? `${currentPlayer.name} marked UNSOLD.` : 'Marked unsold.'
    );
  }

  function handleUndo() {
    const actionType = lastNonUndo?.type;
    const pName = lastNonUndo ? playerMap[lastNonUndo.player_id] : null;
    const msg = actionType === 'sold'
      ? `Sale for ${pName || 'player'} undone. Player returned to bidding.`
      : actionType === 'unsold'
      ? `Unsold status for ${pName || 'player'} undone. Player returned to bidding.`
      : 'Last auction action undone.';

    run(
      () => undoLast(),
      msg
    );
  }

  function handleUnsellSpecificPlayer(playerId: string, playerName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to un-sell "${playerName}"?\n\nThis will remove them from their team, refund the team's purse, and make the player available for auction again.`
    );
    if (!confirmed) return;

    run(
      () => unsellPlayer(playerId),
      `Sale for "${playerName}" undone. Player is now available.`
    );
  }

  /* ── Reset ── */
  function handleConfirmReset() {
    setShowResetModal(false);
    run(
      () => resetAuction(),
      'Auction has been completely reset.'
    );
  }

  /* ── Custom jump confirmation handlers ── */
  function openCustomConfirm(team: AuctionTeam, rawAmount: string | number) {
    const num = Number(rawAmount);
    if (isNaN(num) || num <= 0) {
      showToast('Please enter a valid numeric bid amount.', true);
      return;
    }
    if (nextMinBid !== null && num < nextMinBid) {
      showToast(`Bid must be at least ₹${nextMinBid.toLocaleString('en-IN')}.`, true);
      return;
    }
    if (num > team.max_bid) {
      showToast(`${team.name}'s maximum allowed bid is ₹${team.max_bid.toLocaleString('en-IN')}.`, true);
      return;
    }
    setJumpModal({
      isOpen: true,
      team,
      amount: num,
    });
  }

  function handleConfirmCustomBid() {
    if (!jumpModal.team || !jumpModal.amount) return;
    const teamId = jumpModal.team.id;
    const amount = jumpModal.amount;
    setJumpModal({ isOpen: false, team: null, amount: 0 });
    handleBid(teamId, amount);
  }

  function setCustomInputForTeam(teamId: string, value: string) {
    setTeamCustomInputs((prev) => ({ ...prev, [teamId]: value }));
  }

  const activePoolList = poolTab === 'unsold' ? unsoldList : availablePlayers;

  // Filter pool players in manual mode
  const filteredPoolPlayers = useMemo(() => {
    if (!playerSearch.trim()) return activePoolList;
    const q = playerSearch.toLowerCase();
    return activePoolList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.position && p.position.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }, [activePoolList, playerSearch]);

  const currentDisplayAmount = auctionState.current_bid ?? (currentPlayer?.base_price ?? settings.default_base_price);

  return (
    <>
      {/* ── SVG SPRITE SYMBOLS ── */}
      <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </symbol>
        <symbol id="i-external" viewBox="0 0 24 24">
          <path d="M8 5h11v11M19 5 5 19" />
        </symbol>
        <symbol id="i-screen" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="12" rx="1" />
          <path d="M12 16v4m-4 0h8" />
        </symbol>
        <symbol id="i-team" viewBox="0 0 24 24">
          <path d="M16 20v-1.5c0-2-1.8-3.5-4-3.5s-4 1.5-4 3.5V20M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 8.5a3 3 0 0 1 0 5.8M19 15.8c1.5.4 2.5 1.4 2.5 2.7V20M6 8.5a3 3 0 0 0 0 5.8M5 15.8c-1.5.4-2.5 1.4-2.5 2.7V20" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="m5 12 4.5 4.5L19 7" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6 6 18" />
        </symbol>
        <symbol id="i-undo" viewBox="0 0 24 24">
          <path d="M9 7 5 11l4 4M5 11h8a5 5 0 0 1 0 10" />
        </symbol>
        <symbol id="i-reset" viewBox="0 0 24 24">
          <path d="M4 5v5h5M5.3 9A8 8 0 1 1 4 15" />
        </symbol>
        <symbol id="i-pointer" viewBox="0 0 24 24">
          <path d="M5 3l5.5 16 2.1-6.3L19 10 5 3ZM14 15l3 4" />
        </symbol>
        <symbol id="i-ball" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="m12 8-3 2 1 4h4l1-4-3-2ZM12 3v2M4.5 8l2 1M4.6 16l2-1M19.4 16l-2-1M19.5 8l-2 1M12 21v-2" />
        </symbol>
      </svg>

      {/* ── PAGE HEADER ── */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            {settings.tournament_name || 'VSL SEASON 04'}{' '}
            <span style={{ opacity: 0.55 }}>/</span> AUCTION ROOM
          </div>
          <h1 className="page-heading">
            Auction console<span>.</span>
          </h1>
          <p className="page-subtitle">The next signing starts right here.</p>
        </div>

        <div className="session-chip">
          <div className="session-icon">
            <svg className="icon" aria-hidden="true">
              <use href="#i-ball" />
            </svg>
          </div>
          <div>
            <small>AUCTION MODE</small>
            <strong>Operator&apos;s seat</strong>
          </div>
        </div>
      </div>

      {/* ── HERO: PLAYER STAGE & BID BOARD ── */}
      <section className="hero" aria-label="Current player and auction bid">
        {/* Player Stage */}
        <div className="player-stage">
          <div className="hero-graphic" aria-hidden="true" />
          <div className="player-info">
            <div className="block-label">
              <i aria-hidden="true" />
              <span>
                {isBidding
                  ? hasLeader
                    ? 'BIDDING IN PROGRESS'
                    : 'PLAYER ON THE BLOCK'
                  : 'AUCTION IDLE'}
              </span>
            </div>

            <div className="player-label">
              {isBidding ? 'Current player' : 'Player selection'}
            </div>

            <h2 className="player-name">
              {currentPlayer?.name || 'SELECT NEXT PLAYER'}
            </h2>

            <div className="player-details">
              <span className="player-pill">
                <strong>{currentPlayer?.position || (isBidding ? 'NS' : 'POOL')}</strong>
                <small>{isBidding ? 'Position' : `${availablePlayers.length} Left`}</small>
              </span>
              <span className="player-pill">
                <strong>{currentPlayer?.category || (isBidding ? '—' : 'OPEN')}</strong>
                <small>{isBidding ? 'Category' : 'Status'}</small>
              </span>
            </div>

            <div className="opening-price">
              {isBidding ? 'Opening base' : 'Default base'}{' '}
              <strong>
                ₹{(currentPlayer?.base_price ?? settings.default_base_price).toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          {/* Visual cutout or initials */}
          {currentPlayer?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="player-photo"
              src={currentPlayer.photo_url}
              alt={currentPlayer.name}
            />
          ) : currentPlayer ? (
            <div className="player-initials-crest">
              {getInitials(currentPlayer.name)}
            </div>
          ) : (
            <div className="player-initials-crest">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="m12 8-3 2 1 4h4l1-4-3-2ZM12 3v2M4.5 8l2 1M4.6 16l2-1M19.4 16l-2-1M19.5 8l-2 1M12 21v-2" />
              </svg>
            </div>
          )}

          {currentPlayer?.photo_url && (
            <span className="photo-note">Player photograph</span>
          )}
        </div>

        {/* Bid Board */}
        <div className="bid-board">
          <div>
            <div className="bid-top">
              <span className="bid-label">Current bid</span>
              <span className="bid-status">
                {!isBidding ? 'IDLE' : hasLeader ? 'BIDDING' : 'OPENING'}
              </span>
            </div>
            <div className="bid-amount" aria-label="Current bid">
              <span className="currency">₹</span>
              <span className="digits">
                {currentDisplayAmount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bidder-text" title={hasLeader ? `LEADING · ${leaderTeam?.name}` : 'NO BIDS YET'}>
              {!isBidding ? (
                'AUCTION IDLE · SELECT NEXT PLAYER'
              ) : hasLeader ? (
                <>
                  LEADING <span className="small-dot">·</span> {leaderTeam?.name}
                </>
              ) : (
                <>
                  OPENING PRICE <span className="small-dot">·</span> NO BIDS YET
                </>
              )}
            </div>
          </div>

          <div className="next-min">
            <small>Next minimum</small>
            <strong>
              {isBidding && nextMinBid !== null ? `₹${nextMinBid.toLocaleString('en-IN')}` : '—'}
            </strong>
            <svg className="icon" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── IDLE PLAYER SELECTION PANEL ── */}
      {!isBidding && (
        <section className="pool-selector-card" aria-label="Player selection pool">
          <div className="pool-selector-top">
            <div className="pool-selector-title">
              <span>PLAYER POOL</span>
              <div className="pool-tabs">
                <button
                  type="button"
                  className={`pool-tab ${poolTab === 'available' ? 'active' : ''}`}
                  onClick={() => setSelectedPoolTab('available')}
                >
                  AVAILABLE ({availablePlayers.length})
                </button>
                <button
                  type="button"
                  className={`pool-tab unsold ${poolTab === 'unsold' ? 'active' : ''}`}
                  onClick={() => setSelectedPoolTab('unsold')}
                >
                  UNSOLD / ROUND 2 ({unsoldList.length})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {unsoldList.length > 0 && (
                <button
                  type="button"
                  className="requeue-unsold-btn"
                  onClick={handleRequeueUnsold}
                  disabled={isPending}
                  title="Return all unsold players back into the active available pool"
                >
                  <span>🔄</span> RE-QUEUE ALL UNSOLD ({unsoldList.length})
                </button>
              )}

              <button
                type="button"
                className="random-pick-btn"
                onClick={handleRandomPlayer}
                disabled={isPending || (availablePlayers.length === 0 && unsoldList.length === 0)}
              >
                <span>🎲</span>{' '}
                {availablePlayers.length === 0 && unsoldList.length > 0
                  ? 'PICK RANDOM UNSOLD (ROUND 2)'
                  : 'PICK RANDOM PLAYER'}
              </button>

              <input
                type="text"
                className="pool-search-input"
                placeholder={poolTab === 'unsold' ? 'Search unsold players...' : 'Search by name, position...'}
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
              />
            </div>
          </div>

          {availablePlayers.length === 0 && unsoldList.length > 0 && poolTab === 'unsold' && (
            <div className="round-2-alert">
              <div className="round-2-alert-content">
                <span className="round-2-badge">ROUND 2</span>
                <div>
                  <div className="round-2-alert-title">
                    Round 1 Pool Completed · {unsoldList.length} Unsold Player{unsoldList.length > 1 ? 's' : ''} Ready
                  </div>
                  <div className="round-2-alert-desc">
                    These players went unsold in Round 1. You can call them to the block individually, use random pick, or click &quot;Re-queue All Unsold&quot; to restore them to the main pool.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePoolList.length === 0 ? (
            <div className="text-center py-10 text-gray-300 font-bold text-sm">
              {poolTab === 'unsold'
                ? 'No unsold players at this stage.'
                : unsoldList.length > 0
                ? 'All initial players have been auctioned! Switch to the Unsold tab above to start Round 2.'
                : 'All players have been auctioned! Check the teams and audit log below.'}
            </div>
          ) : filteredPoolPlayers.length === 0 ? (
            <div className="text-center py-8 text-gray-300 font-bold text-sm">
              No {poolTab === 'unsold' ? 'unsold' : 'available'} players match &quot;{playerSearch}&quot;.
            </div>
          ) : (
            <div className="pool-grid">
              {filteredPoolPlayers.map((player) => (
                <div key={player.id} className="pool-player-card">
                  <div className="pool-player-left">
                    <div className="pool-player-avatar">
                      {player.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={player.photo_url} alt={player.name} />
                      ) : (
                        <span>{getInitials(player.name)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="pool-player-name">{player.name}</span>
                        {player.status === 'unsold' && (
                          <span className="pool-unsold-tag">
                            ROUND 2
                          </span>
                        )}
                      </div>
                      <div className="pool-player-meta">
                        <span className="bg-slate-100 px-1 py-0.5 border border-slate-200">
                          {player.position || 'NS'}
                        </span>
                        <span>·</span>
                        <span>{player.category || 'General'}</span>
                        <span>·</span>
                        <span className="font-extrabold text-blue-800">
                          ₹{player.base_price.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="pool-call-btn"
                    onClick={() => handlePickPlayer(player.id)}
                    disabled={isPending}
                  >
                    CALL TO BLOCK ↗
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── FLOOR HEADER ── */}
      <div className="floor-header">
        <div>
          <div className="floor-kicker">The bidding floor</div>
          <div className="floor-title-row">
            <h2 className="floor-title">Select a club</h2>
            <span className="club-count">
              {String(auctionTeams.length).padStart(2, '0')} TEAMS
            </span>
          </div>
          <p className="floor-desc">
            {isBidding
              ? 'Every card is a bid. Choose your team to make your move.'
              : 'Bidding for this player is closed. Select a player above to begin.'}
          </p>
        </div>

        <div className="tap-instruction">
          <svg className="icon" aria-hidden="true">
            <use href="#i-pointer" />
          </svg>
          <span>
            {isBidding && nextMinBid !== null
              ? `TAP A TEAM TO BID ₹${nextMinBid.toLocaleString('en-IN')}`
              : 'BIDDING CLOSED'}
          </span>
        </div>
      </div>

      {/* ── TEAMS GRID & VERDICT CARD ── */}
      <section className="teams-grid" aria-label="Teams and auction controls">
        {auctionTeams.map((team, index) => {
          const isLeader = hasLeader && auctionState.leading_team_id === team.id;
          const canBidMin = isBidding && nextMinBid !== null && nextMinBid <= team.max_bid && !isLeader;
          const customVal = teamCustomInputs[team.id] ?? '';
          const customNum = Number(customVal);
          const isCustomValid = isBidding && !isPending && customVal.trim() !== '' && !isNaN(customNum) && customNum >= (nextMinBid ?? 0) && customNum <= team.max_bid;
          const pal = CREST_PALETTES[index % CREST_PALETTES.length];

          return (
            <article
              key={team.id}
              className={`team-card ${isLeader ? 'leading' : ''} ${!isBidding ? 'closed' : ''}`}
            >
              {/* Clickable Card Body for Minimum Bid */}
              <button
                type="button"
                className="team-hit"
                disabled={!canBidMin || isPending}
                onClick={() => {
                  if (canBidMin && nextMinBid !== null) {
                    handleBid(team.id, nextMinBid);
                  }
                }}
                aria-label={
                  isBidding && nextMinBid !== null
                    ? `Place minimum bid of ₹${nextMinBid.toLocaleString('en-IN')} for ${team.name}`
                    : `Bidding closed for ${team.name}`
                }
              >
                <span className="card-top">
                  <span>CLUB {String(index + 1).padStart(2, '0')}</span>
                  <span className={`team-state ${isLeader ? 'leader' : ''}`}>
                    {isLeader
                      ? 'LEADING'
                      : !isBidding
                      ? 'CLOSED'
                      : team.max_bid >= (nextMinBid ?? 0)
                      ? 'READY'
                      : 'PURSE EXCEEDED'}
                  </span>
                </span>

                <span className="club-row">
                  <span className="club-crest">
                    {team.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logo_url} alt={team.name} />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center font-extrabold text-xs tracking-wider"
                        style={{
                          backgroundColor: pal.bg,
                          color: pal.text,
                          border: `2px solid ${pal.border}`,
                          clipPath: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)',
                          fontFamily: 'var(--display)',
                          fontSize: '17px',
                        }}
                      >
                        {getInitials(team.name)}
                      </div>
                    )}
                  </span>
                  <span className="club-info">
                    <span className="club-name">{team.name}</span>
                    <span className="club-squad">
                      SQUAD <strong>{team.squad_size}</strong>
                    </span>
                  </span>
                </span>

                <span className="club-metrics">
                  <span className="club-metric">
                    <span className="metric-label">AVAILABLE PURSE</span>
                    <span className="metric-value">
                      ₹{team.purse_remaining.toLocaleString('en-IN')}
                    </span>
                  </span>
                  <span className="club-metric">
                    <span className="metric-label">MAX ALLOWED</span>
                    <span className="metric-value">
                      ₹{team.max_bid.toLocaleString('en-IN')}
                    </span>
                  </span>
                </span>

                <span className="bid-cue">
                  <span className="cue-label">
                    {isLeader
                      ? 'CURRENT LEADER'
                      : isBidding
                      ? 'SELECT TO BID'
                      : 'BIDDING CLOSED'}
                  </span>
                  <strong className="cue-price">
                    {isBidding && nextMinBid !== null
                      ? `₹${nextMinBid.toLocaleString('en-IN')}`
                      : '—'}
                  </strong>
                  <svg className="icon" aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </span>
              </button>

              {/* Custom Jump Bid Row */}
              <div className="jump-row">
                <label className="jump-input">
                  <span className="sr-only">Custom jump bid for {team.name}</span>
                  <span aria-hidden="true">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={nextMinBid ?? 0}
                    step={settings.bid_granularity}
                    placeholder={nextMinBid !== null ? String(nextMinBid + settings.bid_granularity) : ''}
                    value={customVal}
                    onChange={(e) => setCustomInputForTeam(team.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (isCustomValid) openCustomConfirm(team, customVal);
                      }
                    }}
                    disabled={!isBidding || isPending}
                    aria-label={`Custom jump bid for ${team.name}`}
                  />
                </label>
                <button
                  type="button"
                  className="jump-btn"
                  disabled={!isCustomValid}
                  onClick={() => openCustomConfirm(team, customVal)}
                  aria-label={`Place custom jump bid for ${team.name}`}
                >
                  JUMP ↗
                </button>
              </div>
            </article>
          );
        })}

        {/* Verdict / Control Card */}
        <aside className="verdict-card" aria-label="Auction controls">
          <div>
            <div className="verdict-kicker">Auction control</div>
            <h3 className="verdict-title">Make the call.</h3>
            <p className="verdict-desc">
              {isBidding
                ? "Close the bidding when you're ready."
                : 'Select the next player to open the bidding floor.'}
            </p>
          </div>

          <div>
            <div className="verdict-actions">
              <button
                type="button"
                className="decision sold"
                disabled={!isBidding || !hasLeader || isPending}
                onClick={() => setShowSoldModal(true)}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-check" />
                </svg>
                MARK SOLD
              </button>

              <button
                type="button"
                className="decision unsold"
                disabled={!isBidding || isPending}
                onClick={() => setShowUnsoldModal(true)}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-x" />
                </svg>
                UNSOLD
              </button>
            </div>

            <div className="verdict-bottom">
              <button
                type="button"
                className="text-action"
                disabled={!canUndo}
                onClick={handleUndo}
                title={canUndo ? undoLabel : 'Nothing to undo'}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-undo" />
                </svg>
                {undoLabel}
              </button>

              <button
                type="button"
                className="text-action reset"
                disabled={isPending}
                onClick={() => setShowResetModal(true)}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-reset" />
                </svg>
                Reset auction
              </button>
            </div>
          </div>
        </aside>
      </section>

      {/* ── RECENT AUCTION LOG ── */}
      <section className="recent-log-card" aria-label="Recent auction activity log">
        <div className="recent-log-header">
          <div>
            <div className="recent-log-kicker">Live Activity Log</div>
            <h3 className="recent-log-title">Recent Auction Log</h3>
          </div>
          <span className="recent-log-badge">
            {recentLog.length} {recentLog.length === 1 ? 'EVENT' : 'EVENTS'}
          </span>
        </div>

        <div className="recent-log-table-wrap">
          <table className="recent-log-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Type</th>
                <th>Player</th>
                <th>Team</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Time</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentLog.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                    No auction activity recorded yet for this session.
                  </td>
                </tr>
              ) : (
                recentLog.map((log) => {
                  const playerName = playerMap[log.player_id] || log.player_id;
                  const teamName = log.team_id ? teamMap[log.team_id] || log.team_id : '—';
                  const amountStr = log.amount !== null && log.amount !== undefined ? `₹${log.amount.toLocaleString('en-IN')}` : '—';
                  const timeStr = formatTime(log.created_at);
                  const isLatestAction = log.id === lastNonUndo?.id;

                  return (
                    <tr key={log.id}>
                      <td>
                        <span className={`log-badge ${log.type}`}>
                          {log.type === 'bid' && 'BID'}
                          {log.type === 'sold' && 'SOLD'}
                          {log.type === 'unsold' && 'UNSOLD'}
                          {log.type === 'undo' && 'UNDO'}
                        </span>
                      </td>
                      <td className="font-bold text-slate-900">{playerName}</td>
                      <td className="text-slate-700">{teamName}</td>
                      <td style={{ textAlign: 'right' }} className="font-extrabold text-blue-900 font-mono">
                        {amountStr}
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-slate-400 font-medium text-xs">
                        {timeStr}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isLatestAction && log.type !== 'undo' && (
                          <button
                            type="button"
                            onClick={handleUndo}
                            disabled={isPending}
                            className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-amber-950 bg-amber-400 hover:bg-amber-300 border border-amber-600 rounded transition-colors shadow-sm"
                            title="Undo this action"
                          >
                            Undo
                          </button>
                        )}
                        {!isLatestAction && log.type === 'sold' && (
                          <button
                            type="button"
                            onClick={() => handleUnsellSpecificPlayer(log.player_id, playerName)}
                            disabled={isPending}
                            className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded transition-colors"
                            title={`Un-sell ${playerName} and return to available pool`}
                          >
                            Un-sell
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── TOAST NOTIFICATION ── */}
      <div
        className={`toast ${toast ? 'show' : ''} ${toast?.isError ? 'error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {toast?.message}
      </div>

      {/* ── MODALS ── */}

      {/* 1. JUMP BID CONFIRMATION MODAL */}
      {jumpModal.isOpen && jumpModal.team && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-top">
              <span className="modal-eyebrow">VSL SEASON 04 · CONFIRM JUMP BID</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setJumpModal({ isOpen: false, team: null, amount: 0 })}
                aria-label="Close dialog"
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>

            <h2>Place Jump Bid?</h2>
            <p className="modal-desc">
              Are you sure you want to place a direct jump bid for <strong>{jumpModal.team.name}</strong>?
            </p>

            <div className="modal-extra">
              <div className="modal-score">
                <div>
                  <small>JUMP BID AMOUNT</small>
                  <strong>₹{jumpModal.amount.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span>Next min was ₹{nextMinBid?.toLocaleString('en-IN') ?? '—'}</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                onClick={() => setJumpModal({ isOpen: false, team: null, amount: 0 })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn confirm"
                onClick={handleConfirmCustomBid}
              >
                Confirm Jump Bid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MARK SOLD CONFIRMATION MODAL */}
      {showSoldModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-top">
              <span className="modal-eyebrow">VSL SEASON 04 · CONFIRM SALE</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowSoldModal(false)}
                aria-label="Close dialog"
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>

            <h2>Confirm the sale?</h2>
            <p className="modal-desc">
              Sell <strong>{currentPlayer?.name || 'Player'}</strong> to{' '}
              <strong>{leaderTeam?.name || 'Winning Team'}</strong> for{' '}
              <strong>₹{(auctionState.current_bid ?? 0).toLocaleString('en-IN')}</strong>? This will finalize this signing and update the team purse.
            </p>

            <div className="modal-extra">
              <div className="modal-score">
                <div>
                  <small>FINAL PRICE</small>
                  <strong>₹{(auctionState.current_bid ?? 0).toLocaleString('en-IN')}</strong>
                </div>
                <span>Sold to {leaderTeam?.name || 'Winning Team'}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                onClick={() => setShowSoldModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn confirm"
                style={{ background: 'var(--yellow)', color: 'var(--ink)' }}
                onClick={handleConfirmSold}
              >
                Confirm Sold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MARK UNSOLD CONFIRMATION MODAL */}
      {showUnsoldModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-top">
              <span className="modal-eyebrow">VSL SEASON 04 · MARK UNSOLD</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowUnsoldModal(false)}
                aria-label="Close dialog"
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>

            <h2>Mark as unsold?</h2>
            <p className="modal-desc">
              Close bidding and mark <strong>{currentPlayer?.name ?? 'this player'}</strong> as unsold?
              {hasLeader ? ' This player currently has bids placed.' : ''}
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                onClick={() => setShowUnsoldModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn confirm"
                onClick={handleConfirmUnsold}
              >
                Mark Unsold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. RESET AUCTION CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-top">
              <span className="modal-eyebrow">VSL SEASON 04 · RESET AUCTION</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowResetModal(false)}
                aria-label="Close dialog"
              >
                <svg className="icon" aria-hidden="true">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>

            <h2>Reset the auction?</h2>
            <p className="modal-desc">
              This clears all bid logs, resets sold players back to available status, restores all team purses to their starting budgets, and sets the auction state to idle.
              <br />
              <strong className="text-red-600 block mt-2">This action cannot be undone.</strong>
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn confirm"
                style={{ background: '#d93829', color: '#fff', borderColor: '#d93829' }}
                onClick={handleConfirmReset}
              >
                Reset Auction
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
