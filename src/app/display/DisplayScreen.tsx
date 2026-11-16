'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuctionState, Player, Settings, Team, BidLog } from '@/lib/supabase/types';
import { playBidSound } from '@/lib/sound';
import { getInitials } from '@/lib/player-constants';
import { getTeamPalette, getTeamInitials } from '@/lib/team-utils';
import { SoldRevealOverlay, type SoldRevealData } from './SoldRevealOverlay';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

interface DisplayProps {
  initialSettings: Settings;
  initialAuctionState: AuctionState;
  initialCurrentPlayer: Player | null;
  initialLeadingTeam: Team | null;
  initialTeams: Team[];
  initialPlayers: Player[];
  initialRecentSold: (Player & { teamName?: string })[];
}

export default function DisplayScreen({
  initialSettings,
  initialAuctionState,
  initialCurrentPlayer,
  initialLeadingTeam,
  initialTeams,
  initialPlayers,
  initialRecentSold,
}: DisplayProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [auctionState, setAuctionState] = useState<AuctionState>(initialAuctionState);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(initialCurrentPlayer);
  const [leadingTeam, setLeadingTeam] = useState<Team | null>(initialLeadingTeam);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [recentSold, setRecentSold] = useState<(Player & { teamName?: string })[]>(initialRecentSold);
  const [activeReveal, setActiveReveal] = useState<SoldRevealData | null>(null);

  // Connection & resync status (Decision 2)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting'>('connected');

  // View state: 'stage' (Cinematic Stage) or 'board' (Teams Board)
  const [view, setView] = useState<'stage' | 'board'>('stage');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'purse' | 'squad' | 'name'>('purse');

  // Controls & feedback
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const prevBidRef = useRef<number | null>(initialAuctionState.current_bid);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Keep a stable Supabase client instance so channels remain permanently connected
  const supabase = useMemo(() => createClient(), []);

  // Reveal queue and event deduplication refs
  const revealQueueRef = useRef<SoldRevealData[]>([]);
  const handledSoldIdsRef = useRef<Set<string>>(new Set());
  const activeRevealRef = useRef<SoldRevealData | null>(null);
  const playersRef = useRef<Player[]>(players);
  const teamsRef = useRef<Team[]>(teams);

  // Sync refs safely outside render for realtime event handlers
  useEffect(() => {
    activeRevealRef.current = activeReveal;
  }, [activeReveal]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3200);
  }, []);

  // Advance the reveal queue when current reveal finishes or is skipped
  const advanceRevealQueue = useCallback(() => {
    if (revealQueueRef.current.length > 0) {
      const next = revealQueueRef.current.shift()!;
      setActiveReveal(next);
    } else {
      setActiveReveal(null);
    }
  }, []);

  const handleFinishReveal = useCallback(() => {
    advanceRevealQueue();
  }, [advanceRevealQueue]);

  const handleSkipReveal = useCallback(() => {
    advanceRevealQueue();
  }, [advanceRevealQueue]);

  // Queue consecutive sales or play immediately
  const enqueueOrPlayReveal = useCallback((revealData: SoldRevealData) => {
    if (activeRevealRef.current) {
      revealQueueRef.current.push(revealData);
    } else {
      setActiveReveal(revealData);
    }
  }, []);

  // Handle undo event: cancels queued reveals, active reveal, and clears deduplication cache for the undone player
  const handleUndoEvent = useCallback(
    (undonePlayerId: string) => {
      // 1. Purge all deduplication keys tied to this player so they can be re-sold and celebrated again
      for (const key of Array.from(handledSoldIdsRef.current)) {
        if (key.includes(undonePlayerId)) {
          handledSoldIdsRef.current.delete(key);
        }
      }

      // 2. Remove any pending queued reveals for this player
      revealQueueRef.current = revealQueueRef.current.filter(
        (item) => item.playerId !== undonePlayerId
      );

      // 3. If currently showing this player, dismiss immediately and advance queue
      if (activeRevealRef.current && activeRevealRef.current.playerId === undonePlayerId) {
        advanceRevealQueue();
      }

      // 4. Remove from recent sold list
      setRecentSold((prev) => prev.filter((p) => p.id !== undonePlayerId));
    },
    [advanceRevealQueue]
  );

  const enqueueOrPlayRevealRef = useRef(enqueueOrPlayReveal);
  const handleUndoEventRef = useRef(handleUndoEvent);

  useEffect(() => {
    enqueueOrPlayRevealRef.current = enqueueOrPlayReveal;
  }, [enqueueOrPlayReveal]);

  useEffect(() => {
    handleUndoEventRef.current = handleUndoEvent;
  }, [handleUndoEvent]);

  // Safe staging/operator preview trigger without modifying the live database
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __testSoldReveal?: (custom?: Partial<SoldRevealData>) => void }).__testSoldReveal = (
        custom?: Partial<SoldRevealData>
      ) => {
        const demoPlayer = currentPlayer || players[0];
        const demoTeam = leadingTeam || teams[0];
        const mockReveal: SoldRevealData = {
          eventId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          playerId: demoPlayer?.id || 'demo-p1',
          playerName: demoPlayer?.name || 'Demo Player',
          playerPosition: demoPlayer?.position || 'Forward',
          playerCategory: demoPlayer?.category || 'Tier 1',
          photoUrl: demoPlayer?.photo_url || null,
          teamId: demoTeam?.id || 'demo-t1',
          teamName: demoTeam?.name || 'Demo FC',
          teamLogo: demoTeam?.logo_url || null,
          price: auctionState.current_bid || 150000,
          ...custom,
        };
        enqueueOrPlayReveal(mockReveal);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __testSoldReveal?: unknown }).__testSoldReveal;
      }
    };
  }, [currentPlayer, players, leadingTeam, teams, auctionState.current_bid, enqueueOrPlayReveal]);

  // Fullscreen handler
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } else {
          showToast('Fullscreen is unavailable in this viewer. Use your browser fullscreen (F11).');
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch {
      showToast('Fullscreen is unavailable in this viewer. Use your browser fullscreen (F11).');
    }
  };

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Escape key closes filters
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && filtersOpen) {
        setFiltersOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtersOpen]);

  // Flash bid sound on bid increase
  useEffect(() => {
    if (
      auctionState.status === 'bidding' &&
      auctionState.current_bid != null &&
      prevBidRef.current != null &&
      auctionState.current_bid > prevBidRef.current
    ) {
      if (soundEnabled) playBidSound();
    }
    prevBidRef.current = auctionState.current_bid;
  }, [auctionState.current_bid, auctionState.status, soundEnabled]);

  // Safe snapshot resynchronization on reconnect (avoids replaying past sales)
  const resyncSnapshot = useCallback(async () => {
    try {
      const [
        { data: sData },
        { data: pData },
        { data: tData },
      ] = await Promise.all([
        supabase.from('auction_state').select('*').single(),
        supabase.from('players').select('*'),
        supabase.from('teams').select('*').order('name'),
      ]);

      if (sData) {
        setAuctionState(sData as AuctionState);
        if (sData.current_player_id && pData) {
          const cp = (pData as Player[]).find((p) => p.id === sData.current_player_id);
          setCurrentPlayer(cp || null);
        } else {
          setCurrentPlayer(null);
        }
        if (sData.leading_team_id && tData) {
          const lt = (tData as Team[]).find((t) => t.id === sData.leading_team_id);
          setLeadingTeam(lt || null);
        } else {
          setLeadingTeam(null);
        }
      }
      if (pData) {
        setPlayers(pData as Player[]);
        // Ensure all currently sold players are in handledSoldIdsRef so reconnect never replays old reveals
        (pData as Player[]).forEach((p) => {
          if (p.status === 'sold') {
            handledSoldIdsRef.current.add(`sold:${p.id}:${p.sold_price || 0}`);
          }
        });
      }
      if (tData) {
        setTeams(tData as Team[]);
      }
    } catch (e) {
      console.error('Safe resync error:', e);
    }
  }, [supabase]);

  const handleChannelStatus = useCallback(
    (status: string) => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus((prev) => {
          if (prev === 'reconnecting') {
            resyncSnapshot();
          }
          return 'connected';
        });
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        setConnectionStatus('reconnecting');
      }
    },
    [resyncSnapshot]
  );

  // Online / offline network event listeners
  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus('connected');
      resyncSnapshot();
    };
    const handleOffline = () => {
      setConnectionStatus('reconnecting');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [resyncSnapshot]);

  // Supabase Realtime Channels
  useEffect(() => {
    // 1. Listen for auction_state changes
    const stateChannel = supabase
      .channel('display_auction_state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auction_state' },
        async (payload) => {
          const newState = payload.new as AuctionState;
          setAuctionState(newState);

          if (newState.current_player_id) {
            // When a player is actively on the block, ensure their old sold cache is clear
            for (const key of Array.from(handledSoldIdsRef.current)) {
              if (key.includes(newState.current_player_id)) {
                handledSoldIdsRef.current.delete(key);
              }
            }

            const { data: pData } = await supabase
              .from('players')
              .select('*')
              .eq('id', newState.current_player_id)
              .single();
            if (pData) setCurrentPlayer(pData as Player);
          } else {
            setCurrentPlayer(null);
          }

          if (newState.leading_team_id) {
            const { data: tData } = await supabase
              .from('teams')
              .select('*')
              .eq('id', newState.leading_team_id)
              .single();
            if (tData) setLeadingTeam(tData as Team);
          } else {
            setLeadingTeam(null);
          }
        }
      )
      .subscribe(handleChannelStatus);

    // 2. Listen for players changes (roster updates, and sold event fallback)
    const playersChannel = supabase
      .channel('display_players')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        async (payload) => {
          // Re-fetch all players to keep rosters and tournament overview exact
          const { data: allPlayersData } = await supabase.from('players').select('*');
          if (allPlayersData) setPlayers(allPlayersData as Player[]);

          const updatedPlayer = payload.new as Player;

          // If a player was marked sold
          if (payload.eventType === 'UPDATE' && updatedPlayer.status === 'sold') {
            const winnerTeam = teamsRef.current.find((t) => t.id === updatedPlayer.team_id);
            setRecentSold((prev) => [
              { ...updatedPlayer, teamName: winnerTeam?.name },
              ...prev.filter((p) => p.id !== updatedPlayer.id).slice(0, 4),
            ]);

            // Deduplicate across channels using saleKey
            const saleKey = `sold:${updatedPlayer.id}:${updatedPlayer.sold_price || 0}`;
            if (!handledSoldIdsRef.current.has(saleKey)) {
              handledSoldIdsRef.current.add(saleKey);

              const revealItem: SoldRevealData = {
                eventId: `player-${updatedPlayer.id}-${Date.now()}`,
                playerId: updatedPlayer.id,
                playerName: updatedPlayer.name,
                playerPosition: updatedPlayer.position,
                playerCategory: updatedPlayer.category,
                photoUrl: updatedPlayer.photo_url,
                teamId: updatedPlayer.team_id,
                teamName: winnerTeam?.name || 'Winning Team',
                teamLogo: winnerTeam?.logo_url || null,
                price: Number(updatedPlayer.sold_price || 0),
              };

              enqueueOrPlayRevealRef.current(revealItem);
            }
          } else if (payload.eventType === 'UPDATE' && updatedPlayer.status === 'available') {
            // Player sale was undone or marked available again: purge cache and dismiss stale reveals
            handleUndoEventRef.current(updatedPlayer.id);
          }
        }
      )
      .subscribe(handleChannelStatus);

    // 3. Listen for bid_log entries (sole animation trigger for committed sales, plus undo handling)
    const logChannel = supabase
      .channel('display_bid_log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bid_log' },
        async (payload) => {
          const newEntry = payload.new as BidLog;
          if (newEntry.type === 'sold') {
            const saleKey = `sold:${newEntry.player_id}:${newEntry.amount || 0}`;
            // Deduplicate by event UUID and saleKey
            if (
              handledSoldIdsRef.current.has(newEntry.id) ||
              handledSoldIdsRef.current.has(saleKey)
            ) {
              return;
            }
            handledSoldIdsRef.current.add(newEntry.id);
            handledSoldIdsRef.current.add(saleKey);

            // Fetch authoritative player and team data
            const fallbackPlayer = playersRef.current.find((p) => p.id === newEntry.player_id);
            const fallbackTeam = teamsRef.current.find((t) => t.id === newEntry.team_id);

            const { data: pData } = await supabase
              .from('players')
              .select('*')
              .eq('id', newEntry.player_id)
              .single();

            const { data: tData } = newEntry.team_id
              ? await supabase.from('teams').select('*').eq('id', newEntry.team_id).single()
              : { data: null };

            const playerName = pData?.name || fallbackPlayer?.name || 'Player';
            const playerPosition = pData?.position || fallbackPlayer?.position || null;
            const playerCategory = pData?.category || fallbackPlayer?.category || null;
            const photoUrl = pData?.photo_url || fallbackPlayer?.photo_url || null;
            const teamName = tData?.name || fallbackTeam?.name || 'Winning Team';
            const teamLogo = tData?.logo_url || fallbackTeam?.logo_url || null;
            const price = Number(newEntry.amount || 0);

            const revealItem: SoldRevealData = {
              eventId: newEntry.id,
              seqId: newEntry.seq_id,
              playerId: newEntry.player_id,
              playerName,
              playerPosition,
              playerCategory,
              photoUrl,
              teamId: newEntry.team_id,
              teamName,
              teamLogo,
              price,
            };

            // Keep recent sold list fresh with confirmed sale
            setRecentSold((prev) => [
              {
                id: newEntry.player_id,
                name: playerName,
                position: playerPosition,
                category: playerCategory,
                photo_url: photoUrl,
                status: 'sold',
                team_id: newEntry.team_id,
                sold_price: price,
                base_price: fallbackPlayer?.base_price || 0,
                created_at: newEntry.created_at,
                teamName,
              },
              ...prev.filter((p) => p.id !== newEntry.player_id).slice(0, 4),
            ]);

            enqueueOrPlayRevealRef.current(revealItem);
          } else if (newEntry.type === 'undo') {
            handleUndoEventRef.current(newEntry.player_id);
          }
        }
      )
      .subscribe(handleChannelStatus);

    // 4. Listen for teams changes
    const teamsChannel = supabase
      .channel('display_teams')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        async () => {
          const { data } = await supabase.from('teams').select('*').order('name');
          if (data) setTeams(data as Team[]);
        }
      )
      .subscribe(handleChannelStatus);

    // 5. Listen for settings changes
    const settingsChannel = supabase
      .channel('display_settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          if (payload.new) setSettings(payload.new as Settings);
        }
      )
      .subscribe(handleChannelStatus);

    return () => {
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(logChannel);
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [supabase, handleChannelStatus]);

  // Overall Tournament Summary Calculations
  const totalTeams = teams.length;
  const soldPlayers = useMemo(() => players.filter((p) => p.status === 'sold'), [players]);
  const soldCount = soldPlayers.length;
  const totalPlayersCount = players.length;
  const totalSpent = useMemo(() => soldPlayers.reduce((acc, p) => acc + (p.sold_price || 0), 0), [soldPlayers]);
  const totalPurse = useMemo(() => teams.reduce((acc, t) => acc + (t.purse_total || 0), 0), [teams]);

  const topBuy = useMemo(() => {
    if (soldPlayers.length === 0) return null;
    return [...soldPlayers].sort((a, b) => (b.sold_price || 0) - (a.sold_price || 0))[0];
  }, [soldPlayers]);

  // Detailed per-team data with squad list and financial health
  const teamCardsData = useMemo(() => {
    const minSquad = settings.min_squad || 11;
    const maxSquad = settings.max_squad || 18;
    const minBasePrice = settings.min_base_price || settings.default_base_price || 1;

    return teams.map((team, index) => {
      const teamBoughtPlayers = players
        .filter((p) => p.team_id === team.id && p.status === 'sold')
        .sort((a, b) => (b.sold_price || 0) - (a.sold_price || 0));

      const squad = teamBoughtPlayers.length;
      const spent = teamBoughtPlayers.reduce((acc, p) => acc + (p.sold_price || 0), 0);
      const remaining = (team.purse_total || 0) - spent;
      const needed = Math.max(0, minSquad - squad);
      const progressPercent = Math.min(100, Math.round((squad / minSquad) * 100));
      const maxBid = Math.max(0, remaining - Math.max(0, minSquad - squad - 1) * minBasePrice);
      const slots = Math.max(0, maxSquad - squad);

      return {
        team,
        index,
        players: teamBoughtPlayers,
        squad,
        spent,
        remaining,
        needed,
        min: minSquad,
        progressPercent,
        maxBid,
        slots,
      };
    });
  }, [teams, players, settings]);

  // Filtered and sorted team cards for the Teams Board
  const filteredTeams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = teamCardsData;

    if (q) {
      result = result.filter(
        (item) =>
          item.team.name.toLowerCase().includes(q) ||
          item.players.some((p) => p.name.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'purse') {
        return b.remaining - a.remaining || a.index - b.index;
      }
      if (sortBy === 'squad') {
        return b.squad - a.squad || a.index - b.index;
      }
      return a.team.name.localeCompare(b.team.name);
    });
  }, [teamCardsData, searchQuery, sortBy]);

  // Format Player Name with accent dot
  const renderPlayerName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return (
        <span className="name-line">
          {parts[0]}
          <span className="name-dot">.</span>
        </span>
      );
    }
    const lastName = parts.pop();
    const firstNames = parts.join(' ');
    return (
      <>
        <span className="name-line">{firstNames}</span>{' '}
        <span className="name-line last-name">
          {lastName}
          <span className="name-dot">.</span>
        </span>
      </>
    );
  };

  // Helper format currency
  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  // Current bidding status helpers
  const isBiddingActive = auctionState.status === 'bidding' && currentPlayer;
  const isSoldStatus = currentPlayer?.status === 'sold';
  const isUnsoldStatus = currentPlayer?.status === 'unsold';

  const priceLabel = isSoldStatus
    ? 'Sold For'
    : auctionState.current_bid != null && currentPlayer && auctionState.current_bid > currentPlayer.base_price
    ? 'Current Bid'
    : 'Opening Price';

  const currentDisplayPrice =
    auctionState.current_bid != null
      ? auctionState.current_bid
      : currentPlayer
      ? currentPlayer.base_price
      : 0;

  return (
    <div className="display-app">
      {/* ── TOP BAR: Navigation, Views & Controls ── */}
      <header className="topbar">
        <div className="brand" aria-label={settings.tournament_name || 'AUCTION ASSIST'}>
          {settings.logo_url ? (
            <ImageWithFallback
              src={settings.logo_url}
              alt={settings.tournament_name || 'AUCTION ASSIST'}
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
                {settings.tournament_name ? settings.tournament_name.slice(0, 3).toUpperCase() : 'AA'}
              </text>
            </svg>
          )}
          <div className="brand-copy">
            <strong>AUCTION ASSIST</strong>
            {settings.tournament_name ? <small>{settings.tournament_name}</small> : null}
          </div>
        </div>

        <div className="bar-title">
          {view === 'board' ? 'TEAMS BOARD' : 'AUCTION STAGE'}
        </div>

        <div className="bar-actions">
          {view === 'stage' && connectionStatus === 'reconnecting' && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded-none animate-pulse"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
              Reconnecting…
            </span>
          )}
          <span className="preview-label">LIVE AUCTION</span>

          {/* Filter button: only visible in board view */}
          {view === 'board' && (
            <button
              className="filter-action"
              type="button"
              aria-label="Filter and sort teams"
              title="Filter and sort teams"
              aria-expanded={filtersOpen}
              onClick={() => {
                const nextState = !filtersOpen;
                setFiltersOpen(nextState);
                if (nextState) {
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }
              }}
            >
              <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />
              </svg>
              <span>Filter &amp; sort</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            className="filter-action"
            type="button"
            title={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
            aria-label={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            <span>{soundEnabled ? '🔔' : '🔕'}</span>
          </button>

          {/* View Switch Button */}
          <button
            className="nav-action"
            type="button"
            onClick={() => {
              setView(view === 'stage' ? 'board' : 'stage');
              setFiltersOpen(false);
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          >
            <span>{view === 'stage' ? 'Teams board' : 'Auction view'}</span>
            <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 12h16M14 6l6 6-6 6" />
            </svg>
          </button>

          {/* Fullscreen Button */}
          <button
            className="fullscreen-action"
            type="button"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen'}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen'}
            onClick={toggleFullscreen}
          >
            <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 9V4h5m6 0h5v5M20 15v5h-5M9 20H4v-5" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── VIEW 1: CINEMATIC STAGE ── */}
      {view === 'stage' && (
        <main className="screen cinematic-stage" id="stageView">
          <div className="cinema-shell">
            <div className="cinema-hero">
              {/* Left Column: Player Identity & Facts */}
              <section className="reveal-copy" aria-labelledby="playerName">
                <div className="reveal-kicker">
                  {isSoldStatus
                    ? 'RECENTLY SOLD'
                    : isUnsoldStatus
                    ? 'PASSED UNSOLD'
                    : isBiddingActive
                    ? 'PLAYER ON THE BLOCK'
                    : 'AUCTION ARENA'}
                </div>

                <h1 className="reveal-name" id="playerName">
                  {currentPlayer
                    ? renderPlayerName(currentPlayer.name)
                    : renderPlayerName(settings.tournament_name || 'STANDBY ARENA')}
                </h1>

                <div className="player-facts" aria-label="Player details">
                  <div className="player-fact">
                    <small>Position</small>
                    <strong>
                      {currentPlayer ? currentPlayer.position || 'NS' : 'ALL'}
                    </strong>
                  </div>
                  <div className="player-fact">
                    <small>Category</small>
                    <strong>
                      {currentPlayer ? currentPlayer.category || 'Standard' : 'Open'}
                    </strong>
                  </div>
                  <div className="player-fact">
                    <small>Base price</small>
                    <strong>
                      {currentPlayer
                        ? formatCurrency(currentPlayer.base_price)
                        : formatCurrency(settings.default_base_price || 1)}
                    </strong>
                  </div>
                </div>
              </section>

              {/* Middle Column: Clean Photo Card */}
              <div className="portrait-scene">
                <div className="clean-photo-card">
                  <div
                    className={`photo-card-frame ${
                      !currentPlayer?.photo_url ? 'is-missing' : ''
                    }`}
                    id="photoFrame"
                  >
                    {currentPlayer?.photo_url ? (
                      <ImageWithFallback
                        id="playerPhoto"
                        src={currentPlayer.photo_url}
                        alt={currentPlayer.name}
                        fallbackText={currentPlayer ? getInitials(currentPlayer.name) : 'AA'}
                      />
                    ) : (
                      <div className="photo-fallback">
                        <span>
                          {currentPlayer ? getInitials(currentPlayer.name) : 'AA'}
                        </span>
                        <div>
                          {currentPlayer
                            ? currentPlayer.name
                            : 'Waiting for Nomination'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Score, Live Bid & Leader */}
              <section className="cinema-score" aria-labelledby="openingLabel">
                <div className="price-label" id="openingLabel">
                  {currentPlayer ? priceLabel : 'Arena Status'}
                </div>

                <div
                  className="price-number"
                  aria-label={`${currentDisplayPrice} rupees`}
                >
                  <span className="currency-sign" aria-hidden="true">
                    ₹
                  </span>
                  <span className="digits" aria-hidden="true">
                    {currentDisplayPrice.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="cinema-leader">
                  <small>
                    {isSoldStatus
                      ? 'Acquired By'
                      : leadingTeam
                      ? 'Leading Bidder'
                      : 'Bidding Status'}
                  </small>
                  <strong>
                    {leadingTeam ? (
                      <span className="inline-flex items-center gap-3">
                        {leadingTeam.logo_url ? (
                          <ImageWithFallback
                            src={leadingTeam.logo_url}
                            alt={leadingTeam.name}
                            className="w-8 h-8 object-contain rounded inline-block align-middle"
                            fallbackText={getTeamInitials(leadingTeam.name)}
                          />
                        ) : (
                          <span
                            className="w-7 h-7 rounded-full inline-flex items-center justify-center font-bold text-xs text-white align-middle"
                            style={{
                              backgroundColor: getTeamPalette(leadingTeam.name).hex,
                            }}
                          >
                            {getTeamInitials(leadingTeam.name)}
                          </span>
                        )}
                        <span>{leadingTeam.name}</span>
                        <span className="name-dot">.</span>
                      </span>
                    ) : (
                      <span>
                        {currentPlayer ? 'No bids yet' : 'Ready for player'}
                        <span className="name-dot">.</span>
                      </span>
                    )}
                  </strong>
                </div>
              </section>
            </div>

            {/* Footer Summary Strip */}
            <footer className="cinema-footer">
              <div className="cinema-stats">
                <div className="cinema-stat">
                  <strong>{String(totalTeams).padStart(2, '0')}</strong>
                  <small>Teams</small>
                </div>
                <div className="cinema-stat">
                  <strong>{String(soldCount).padStart(2, '0')}</strong>
                  <small>Players sold</small>
                </div>
                {recentSold[0] && (
                  <div className="cinema-stat hidden md:flex">
                    <strong className="truncate max-w-[140px]">{recentSold[0].name}</strong>
                    <small>Last Sold · {recentSold[0].teamName || 'Confirmed'}</small>
                  </div>
                )}
              </div>
              <div className="cinema-note">
                {settings.tournament_name || 'VSL SEASON 04'} · LIVE PROJECTOR STAGE
              </div>
            </footer>
          </div>
        </main>
      )}

      {/* ── VIEW 2: TEAMS BOARD ── */}
      {view === 'board' && (
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
                    totalTeams
                  ).padStart(2, '0')} CLUBS`
                : `${String(totalTeams).padStart(2, '0')} CLUBS`}
            </div>
          </div>

          {/* 4 Tournament Stat Cards */}
          <div className="board-stats" aria-label="Tournament summary">
            <div className="board-stat">
              <small>Total teams</small>
              <strong>{String(totalTeams).padStart(2, '0')}</strong>
            </div>

            <div className="board-stat">
              <small>Players sold</small>
              <strong>
                <em>{String(soldCount).padStart(2, '0')}</em>
                <span className="minor">/ {String(totalPlayersCount).padStart(2, '0')}</span>
              </strong>
            </div>

            <div className="board-stat">
              <small>Total spent</small>
              <strong>
                <em>{formatCurrency(totalSpent)}</em>
                <span className="minor">/ {formatCurrency(totalPurse)}</span>
              </strong>
            </div>

            <div className="board-stat topbuy">
              <small>Top buy</small>
              <strong>
                {topBuy ? (
                  <>
                    {topBuy.name} <em>{formatCurrency(topBuy.sold_price || 0)}</em>
                  </>
                ) : (
                  <>None <em>₹0</em></>
                )}
              </strong>
            </div>
          </div>

          {/* Filter and Sort Tools */}
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

          {/* Teams Grid */}
          {filteredTeams.length > 0 ? (
            <section className="board-grid" id="boardGrid" aria-label="Team purse and squad information">
              {filteredTeams.map((item) => (
                <article className="board-card" key={item.team.id}>
                  {/* Card Header: Crest & Team Name */}
                  <div className="board-card-head">
                    <div className="board-crest">
                      {item.team.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.team.logo_url} alt={item.team.name} />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center font-black text-xl text-white select-none"
                          style={{ backgroundColor: getTeamPalette(item.team.name).hex }}
                        >
                          {getTeamInitials(item.team.name)}
                        </div>
                      )}
                    </div>
                    <div className="board-team-copy">
                      <h2 className="board-team-name">{item.team.name}</h2>
                      <span className="board-initial">Initial: {formatCurrency(item.team.purse_total || 0)}</span>
                    </div>
                  </div>

                  {/* Yellow Purse Banner */}
                  <div className="board-purse">
                    <small>Purse Left</small>
                    <strong>{formatCurrency(item.remaining)}</strong>
                  </div>

                  {/* Card Content */}
                  <div className="board-card-content">
                    {/* Squad Progress */}
                    <div className="board-squad">
                      <span>
                        Squad: {item.squad} {item.squad === 1 ? 'player' : 'players'}
                      </span>
                      <span>
                        {item.needed > 0
                          ? `Needs ${item.needed} for min (${item.min})`
                          : `Min reached (${item.min})`}
                      </span>
                    </div>

                    <div className="squad-progress">
                      <span style={{ width: `${item.progressPercent}%` }} />
                    </div>

                    {/* Metrics: Spent, Max Bid, Slots */}
                    <div className="board-metrics">
                      <div className="board-metric">
                        <small>Spent</small>
                        <strong>{formatCurrency(item.spent)}</strong>
                      </div>
                      <div className="board-metric">
                        <small>Max Bid</small>
                        <strong>{formatCurrency(item.maxBid)}</strong>
                      </div>
                      <div className="board-metric">
                        <small>Slots</small>
                        <strong>{item.slots}</strong>
                      </div>
                    </div>

                    {/* Roster of Acquired Players */}
                    <div className="board-roster">
                      <span className="board-roster-title">
                        Players ({item.squad})
                      </span>
                      {item.players.length > 0 ? (
                        <div className="space-y-1">
                          {item.players.map((player) => (
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
                <strong>{String(totalTeams).padStart(2, '0')}</strong>
              </div>
            </div>
            <div className="footer-note">
              {settings.tournament_name || 'VSL SEASON 04'} · LIVE SQUAD &amp; PURSE BOARD
            </div>
          </footer>
        </main>
      )}

      {/* ── CELEBRATORY SIGNING REVEAL OVERLAY ── */}
      {activeReveal && (
        <SoldRevealOverlay
          data={activeReveal}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((prev) => !prev)}
          onFinish={handleFinishReveal}
          onSkip={handleSkipReveal}
        />
      )}

      {/* ── TOAST NOTIFICATION ── */}
      <div
        className={`display-toast ${toastMessage ? 'show' : ''}`}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>
    </div>
  );
}
