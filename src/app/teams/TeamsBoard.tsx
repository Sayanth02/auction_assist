'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Player, Settings, Team } from '@/lib/supabase/types';
import { computeTeamStats } from '@/lib/auction-rules';
import { getTeamPalette, getTeamInitials } from '@/lib/team-utils';

interface TeamsBoardProps {
  initialSettings: Settings;
  initialTeams: Team[];
  initialPlayers: Player[];
}

export default function TeamsBoard({
  initialSettings,
  initialTeams,
  initialPlayers,
}: TeamsBoardProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'purse' | 'squad' | 'name'>('purse');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3200);
  }, []);

  // Realtime updates
  useEffect(() => {
    // 1. Players channel
    const playersChannel = supabase
      .channel('teams_board_players')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        async () => {
          const { data } = await supabase.from('players').select('*').order('name');
          if (data) setPlayers(data as Player[]);
        }
      )
      .subscribe();

    // 2. Teams channel
    const teamsChannel = supabase
      .channel('teams_board_teams')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        async () => {
          const { data } = await supabase.from('teams').select('*').order('name');
          if (data) setTeams(data as Team[]);
        }
      )
      .subscribe();

    // 3. Settings channel
    const settingsChannel = supabase
      .channel('teams_board_settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          if (payload.new) setSettings(payload.new as Settings);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [supabase]);

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          showToast('Entered Fullscreen');
        } else {
          showToast('Fullscreen not supported in this browser.');
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          showToast('Exited Fullscreen');
        }
      }
    } catch {
      showToast('Fullscreen unavailable in this viewer.');
    }
  };

  // Keyboard escape closes filters
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && filtersOpen) {
        setFiltersOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtersOpen]);

  // Focus search input when filter is toggled open
  useEffect(() => {
    if (filtersOpen && searchInputRef.current) {
      searchInputRef.current.focus({ preventScroll: true });
    }
  }, [filtersOpen]);

  // Format currency
  const formatCurrency = useCallback((n: number) => '₹' + Number(n).toLocaleString('en-IN'), []);

  // Compute team stats dynamically
  const teamCards = useMemo(() => {
    return teams.map((team) => {
      const stats = computeTeamStats(
        team,
        players,
        settings.min_squad,
        settings.max_squad,
        settings.min_base_price
      );
      const minSlotsNeeded = Math.max(0, settings.min_squad - stats.squad_size);
      const maxSlotsRemaining = Math.max(0, settings.max_squad - stats.squad_size);
      const progressPercent = Math.min(
        100,
        Math.round((stats.squad_size / (settings.min_squad || 1)) * 100)
      );

      return {
        ...team,
        ...stats,
        minSlotsNeeded,
        maxSlotsRemaining,
        progressPercent,
      };
    });
  }, [teams, players, settings]);

  // Filter & Sort
  const filteredTeams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = teamCards.filter((t) => {
      if (!query) return true;
      const matchesTeam = t.name.toLowerCase().includes(query);
      const matchesPlayer = t.players.some((p) => p.name.toLowerCase().includes(query));
      return matchesTeam || matchesPlayer;
    });

    return list.sort((a, b) => {
      if (sortBy === 'purse') return b.purse_remaining - a.purse_remaining;
      if (sortBy === 'squad') return b.squad_size - a.squad_size;
      return a.name.localeCompare(b.name);
    });
  }, [teamCards, searchQuery, sortBy]);

  // Summary Metrics
  const summary = useMemo(() => {
    const soldPlayers = players.filter((p) => p.status === 'sold');
    const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.sold_price || 0), 0);
    const totalPurse = teams.reduce((sum, t) => sum + (t.purse_total || 0), 0);
    const topBuy = soldPlayers.reduce<Player | null>(
      (max, p) => (!max || (p.sold_price || 0) > (max.sold_price || 0) ? p : max),
      null
    );

    return {
      totalTeams: teams.length,
      totalPlayers: players.length,
      soldCount: soldPlayers.length,
      totalSpent,
      totalPurse,
      topBuy,
    };
  }, [teams, players]);

  return (
    <div className="display-app">
      {/* Hidden SVG Sprite */}
      <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
        <symbol id="p-arrow" viewBox="0 0 24 24">
          <path d="M4 12h16M14 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="p-full" viewBox="0 0 24 24">
          <path d="M4 9V4h5m6 0h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="p-filter" viewBox="0 0 24 24">
          <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="p-search" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="m15.5 15.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </symbol>
      </svg>

      {/* ── TOPBAR ── */}
      <header className="topbar">
        <div className="brand" aria-label={settings.tournament_name || 'VSL'}>
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo_url}
              alt="Logo"
              className="brand-mark object-contain"
            />
          ) : (
            <svg className="brand-mark" viewBox="0 0 48 54" aria-hidden="true">
              <path
                d="M4 4h40v25c0 10-7 17-20 22C11 46 4 39 4 29Z"
                fill="none"
                stroke="#efff00"
                strokeWidth="4"
              />
              <path d="M12 34h24" stroke="#efff00" strokeWidth="2" />
              <text
                x="24"
                y="26"
                fill="#efff00"
                textAnchor="middle"
                fontFamily="Arial,sans-serif"
                fontWeight="900"
                fontSize="12"
              >
                VSL
              </text>
            </svg>
          )}
          <div className="brand-copy">
            <strong>{settings.tournament_name || 'VSL'}</strong>
            <small>SEASON 04</small>
          </div>
        </div>

        <div className="bar-title">TEAMS BOARD</div>

        <div className="bar-actions">
          <span className="preview-label">LIVE BOARD</span>

          <button
            className="filter-action"
            type="button"
            aria-label="Filter and sort teams"
            title="Filter and sort teams"
            aria-expanded={filtersOpen}
            aria-controls="boardTools"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <svg className="icon" aria-hidden="true"><use href="#p-filter" /></svg>
            <span>Filter &amp; sort</span>
          </button>

          <Link href="/display" className="nav-action" title="Switch to Projector view">
            <span>Projector view</span>
            <svg className="icon" aria-hidden="true"><use href="#p-arrow" /></svg>
          </Link>

          <Link
            href="/admin/auction"
            className="nav-action hidden sm:inline-flex"
            title="Admin Console"
          >
            <span>Admin</span>
          </Link>

          <button
            className="fullscreen-action"
            type="button"
            aria-label="Toggle fullscreen"
            title="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            <svg className="icon" aria-hidden="true"><use href="#p-full" /></svg>
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT: TEAMS BOARD ── */}
      <main className="screen" id="boardView">
        {/* Board Heading */}
        <div className="board-heading">
          <div>
            <div className="section-kicker">TOURNAMENT OVERVIEW</div>
            <h1 className="board-title">
              The teams<span>.</span>
            </h1>
            <p className="board-sub">Purse and squad board</p>
          </div>
          <div className="board-heading-mark" id="boardCountLabel">
            {searchQuery
              ? `${String(filteredTeams.length).padStart(2, '0')} OF ${String(
                  summary.totalTeams
                ).padStart(2, '0')} CLUBS`
              : `${String(summary.totalTeams).padStart(2, '0')} CLUBS`}
          </div>
        </div>

        {/* 4 Tournament Stat Cards */}
        <div className="board-stats" aria-label="Tournament summary">
          <div className="board-stat">
            <small>Total teams</small>
            <strong>{String(summary.totalTeams).padStart(2, '0')}</strong>
          </div>

          <div className="board-stat">
            <small>Players sold</small>
            <strong>
              <em>{String(summary.soldCount).padStart(2, '0')}</em>
              <span className="minor">/ {String(summary.totalPlayers).padStart(2, '0')}</span>
            </strong>
          </div>

          <div className="board-stat">
            <small>Total spent</small>
            <strong>
              <em>{formatCurrency(summary.totalSpent)}</em>
              <span className="minor">/ {formatCurrency(summary.totalPurse)}</span>
            </strong>
          </div>

          <div className="board-stat topbuy">
            <small>Top buy</small>
            <strong>
              {summary.topBuy ? (
                <>
                  {summary.topBuy.name} <em>{formatCurrency(summary.topBuy.sold_price || 0)}</em>
                </>
              ) : (
                <>None <em>₹0</em></>
              )}
            </strong>
          </div>
        </div>

        {/* Collapsible Search and Sort Bar */}
        {filtersOpen && (
          <div className="board-tools" id="boardTools">
            <div className="board-search">
              <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 4.5 4.5" />
              </svg>
              <label className="sr-only" htmlFor="boardSearch">
                Search by team or player
              </label>
              <input
                ref={searchInputRef}
                id="boardSearch"
                type="search"
                placeholder="Search by team or player..."
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <span className="sort-label">Sort by</span>

            <button
              className="sort-option"
              type="button"
              data-sort="purse"
              aria-pressed={sortBy === 'purse'}
              onClick={() => setSortBy('purse')}
            >
              Purse remaining
            </button>

            <button
              className="sort-option"
              type="button"
              data-sort="squad"
              aria-pressed={sortBy === 'squad'}
              onClick={() => setSortBy('squad')}
            >
              Squad size
            </button>

            <button
              className="sort-option"
              type="button"
              data-sort="name"
              aria-pressed={sortBy === 'name'}
              onClick={() => setSortBy('name')}
            >
              Name A–Z
            </button>
          </div>
        )}

        {/* Teams 4-Column Responsive Grid */}
        {filteredTeams.length > 0 ? (
          <section className="board-grid" id="boardGrid" aria-label="Team purse and squad information">
            {filteredTeams.map((team) => (
              <article className="board-card" key={team.id}>
                {/* Card Header: Crest & Team Name */}
                <div className="board-card-head">
                  <div className="board-crest">
                    {team.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logo_url} alt={team.name} />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center font-black text-xl text-white select-none"
                        style={{ backgroundColor: getTeamPalette(team.name).hex }}
                      >
                        {getTeamInitials(team.name)}
                      </div>
                    )}
                  </div>
                  <div className="board-team-copy">
                    <h2 className="board-team-name">{team.name}</h2>
                    <span className="board-initial">Initial: {formatCurrency(team.purse_total || 0)}</span>
                  </div>
                </div>

                {/* Yellow Purse Banner */}
                <div className="board-purse">
                  <small>Purse Left</small>
                  <strong>{formatCurrency(team.purse_remaining)}</strong>
                </div>

                {/* Card Content */}
                <div className="board-card-content">
                  {/* Squad Progress Info */}
                  <div className="board-squad">
                    <span className="board-squad-count">
                      Squad: {team.squad_size} {team.squad_size === 1 ? 'player' : 'players'}
                    </span>
                    <span className="board-squad-needed">
                      {team.minSlotsNeeded > 0
                        ? `Needs ${team.minSlotsNeeded} for min (${settings.min_squad})`
                        : `Min reached (${settings.min_squad})`}
                    </span>
                  </div>

                  <div className="squad-progress" aria-hidden="true">
                    <span style={{ width: `${team.progressPercent}%` }} />
                  </div>

                  {/* Metrics: Spent, Max Bid, Slots */}
                  <div className="board-metrics">
                    <div className="board-metric">
                      <small>Spent</small>
                      <strong className="board-spent">{formatCurrency(team.spent)}</strong>
                    </div>
                    <div className="board-metric">
                      <small>Max Bid</small>
                      <strong className="board-max">
                        {team.max_bid > 0 ? formatCurrency(team.max_bid) : 'Full'}
                      </strong>
                    </div>
                    <div className="board-metric">
                      <small>Slots Left</small>
                      <strong className="board-slots">{team.maxSlotsRemaining}</strong>
                    </div>
                  </div>

                  {/* Roster of Acquired Players */}
                  <div className="board-roster">
                    <span className="board-roster-title">
                      Players ({team.players.length})
                    </span>
                    {team.players.length > 0 ? (
                      <div className="board-roster-list space-y-1">
                        {team.players.map((player) => (
                          <div className="board-player-row" key={player.id}>
                            <div className="board-player-copy">
                              <strong className="board-player-name">{player.name}</strong>
                              <span className="board-player-info">
                                {player.position || 'NS'} · {player.category || 'Standard'}
                              </span>
                            </div>
                            <strong className="board-player-price">
                              {formatCurrency(player.sold_price || 0)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="board-unknown">No players acquired yet.</div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="board-empty" id="boardEmpty">
            <strong>No teams found.</strong>
            <p>Try another team or player name.</p>
          </div>
        )}

        {/* Footer */}
        <footer className="screen-footer">
          <div className="footer-stats">
            <div className="footer-stat">
              <small>Team board</small>
              <strong>{String(summary.totalTeams).padStart(2, '0')}</strong>
            </div>
          </div>
          <div className="footer-note">
            {settings.tournament_name || 'VSL SEASON 04'} · LIVE SQUAD &amp; PURSE BOARD
          </div>
        </footer>
      </main>

      {/* Toast Feedback */}
      <div className={`toast ${toastMessage ? 'show' : ''}`} role="status">
        {toastMessage}
      </div>
    </div>
  );
}
