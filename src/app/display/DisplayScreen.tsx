'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { AuctionState, Player, Settings, Team, BidLog } from '@/lib/supabase/types';
import { playBidSound, playSoldFanfare } from '@/lib/sound';
import { getInitials, getPositionLabel } from '@/lib/player-constants';
import { getTeamPalette, getTeamInitials } from '@/lib/team-utils';

interface SoldMomentData {
  playerName: string;
  playerPosition?: string | null;
  playerCategory?: string | null;
  teamName: string;
  teamLogo?: string | null;
  price: number;
}

interface DisplayProps {
  initialSettings: Settings;
  initialAuctionState: AuctionState;
  initialCurrentPlayer: Player | null;
  initialLeadingTeam: Team | null;
  initialTeams: Team[];
  initialRecentSold: (Player & { teamName?: string })[];
}

export default function DisplayScreen({
  initialSettings,
  initialAuctionState,
  initialCurrentPlayer,
  initialLeadingTeam,
  initialTeams,
  initialRecentSold,
}: DisplayProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [auctionState, setAuctionState] = useState<AuctionState>(initialAuctionState);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(initialCurrentPlayer);
  const [leadingTeam, setLeadingTeam] = useState<Team | null>(initialLeadingTeam);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [recentSold, setRecentSold] = useState<(Player & { teamName?: string })[]>(initialRecentSold);
  const [soldMoment, setSoldMoment] = useState<SoldMomentData | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bidPulsing, setBidPulsing] = useState(false);

  const prevBidRef = useRef<number | null>(initialAuctionState.current_bid);
  const soldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  // Helper to find team by ID
  const getTeam = useCallback(
    (teamId: string | null) => {
      if (!teamId) return null;
      return teams.find((t) => t.id === teamId) || null;
    },
    [teams]
  );

  // Trigger celebratory SOLD moment
  const triggerSoldMoment = useCallback(
    (data: SoldMomentData) => {
      if (soldTimerRef.current) clearTimeout(soldTimerRef.current);
      setSoldMoment(data);
      if (soundEnabled) playSoldFanfare();

      soldTimerRef.current = setTimeout(() => {
        setSoldMoment(null);
      }, 7000);
    },
    [soundEnabled]
  );

  // Fullscreen handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
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

  // Flash bid pulse effect on bid increase
  useEffect(() => {
    if (
      auctionState.status === 'bidding' &&
      auctionState.current_bid != null &&
      prevBidRef.current != null &&
      auctionState.current_bid > prevBidRef.current
    ) {
      setBidPulsing(true);
      if (soundEnabled) playBidSound();
      const timer = setTimeout(() => setBidPulsing(false), 800);
      return () => clearTimeout(timer);
    }
    prevBidRef.current = auctionState.current_bid;
  }, [auctionState.current_bid, auctionState.status, soundEnabled]);

  // Set up Supabase Realtime Channels
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
      .subscribe();

    // 2. Listen for players changes (detect sold event or updates)
    const playersChannel = supabase
      .channel('display_players')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        async (payload) => {
          const updatedPlayer = payload.new as Player;

          // If a player was marked sold
          if (payload.eventType === 'UPDATE' && updatedPlayer.status === 'sold') {
            const winnerTeam = getTeam(updatedPlayer.team_id);
            triggerSoldMoment({
              playerName: updatedPlayer.name,
              playerPosition: updatedPlayer.position,
              playerCategory: updatedPlayer.category,
              teamName: winnerTeam?.name || 'Winning Team',
              teamLogo: winnerTeam?.logo_url,
              price: updatedPlayer.sold_price || 0,
            });

            // Refresh recent sold list
            setRecentSold((prev) => [
              { ...updatedPlayer, teamName: winnerTeam?.name },
              ...prev.filter((p) => p.id !== updatedPlayer.id).slice(0, 4),
            ]);
          }
        }
      )
      .subscribe();

    // 3. Listen for bid_log entries (handles sold & undo events)
    const logChannel = supabase
      .channel('display_bid_log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bid_log' },
        async (payload) => {
          const newEntry = payload.new as BidLog;
          if (newEntry.type === 'sold') {
            // Guarantee sold moment even if players channel fired out-of-order
            const { data: pData } = await supabase.from('players').select('*').eq('id', newEntry.player_id).single();
            const { data: tData } = newEntry.team_id
              ? await supabase.from('teams').select('*').eq('id', newEntry.team_id).single()
              : { data: null };

            if (pData && tData) {
              triggerSoldMoment({
                playerName: pData.name,
                playerPosition: pData.position,
                playerCategory: pData.category,
                teamName: tData.name,
                teamLogo: tData.logo_url,
                price: newEntry.amount || 0,
              });
            }
          } else if (newEntry.type === 'undo') {
            // Dismiss sold moment if an undo occurred
            setSoldMoment(null);
          }
        }
      )
      .subscribe();

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
      .subscribe();

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
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(logChannel);
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [supabase, getTeam, triggerSoldMoment]);

  const isBidding = auctionState.status === 'bidding' && currentPlayer;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-emerald-500 selection:text-black overflow-hidden relative font-sans">
      {/* ── TOP BAR: Tournament Branding & Status ── */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 backdrop-blur z-20">
        <div className="flex items-center gap-4">
          {settings.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="Logo" className="h-10 w-10 object-contain rounded" />
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
              {settings.tournament_name || 'Football Auction'}
            </h1>
            <p className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
              Live Tournament Auction
            </p>
          </div>
        </div>

        {/* Status indicator & controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-bold tracking-wider uppercase">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isBidding ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
              }`}
            />
            <span className={isBidding ? 'text-emerald-400' : 'text-amber-400'}>
              {isBidding ? 'Bidding Live' : 'Standby'}
            </span>
          </div>

          {/* Sound Toggle Button */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute Sound' : 'Enable Sound'}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {isFullscreen ? '🗗' : '⛶'}
          </button>

          {/* Link to Teams Board */}
          <Link
            href="/teams"
            target="_blank"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            📋 Teams Board ↗
          </Link>
        </div>
      </header>

      {/* ── MAIN PROJECTOR ARENA ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative z-10 max-w-7xl mx-auto w-full">
        {isBidding && currentPlayer ? (
          /* ── ACTIVE BIDDING STATE ── */
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Col: Player Showcase (5 cols) */}
            <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left space-y-5">
              {/* Photo or Initials Badge */}
              <div className="relative group">
                {currentPlayer.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPlayer.photo_url}
                    alt={currentPlayer.name}
                    className="w-56 h-56 sm:w-72 sm:h-72 object-cover rounded-3xl border-4 border-slate-700 shadow-2xl bg-slate-900"
                  />
                ) : (
                  <div
                    className="w-56 h-56 sm:w-72 sm:h-72 rounded-3xl border-4 border-slate-700 flex flex-col items-center justify-center font-black shadow-2xl"
                    style={{
                      background: `linear-gradient(135deg, ${settings.theme_color || '#16a34a'}33 0%, #0f172a 100%)`,
                    }}
                  >
                    <span className="text-5xl sm:text-7xl font-mono text-emerald-400">
                      {getInitials(currentPlayer.name)}
                    </span>
                  </div>
                )}

                {/* Position Badge overlay */}
                {currentPlayer.position && (
                  <span className="absolute -top-3 -right-3 bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded-full text-sm uppercase tracking-wider shadow-lg">
                    {currentPlayer.position}
                  </span>
                )}
              </div>

              {/* Player Name & Category */}
              <div className="space-y-2">
                <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-tight">
                  {currentPlayer.name}
                </h2>
                <div className="flex items-center justify-center lg:justify-start gap-3 flex-wrap">
                  {currentPlayer.category && (
                    <span className="px-3.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm uppercase tracking-wider">
                      {currentPlayer.category}
                    </span>
                  )}
                  <span className="text-slate-400 font-medium text-base">
                    Base: <span className="text-slate-200 font-bold">₹{currentPlayer.base_price}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right Col: Huge Live Bid & Leader Display (7 cols) */}
            <div className="lg:col-span-7 flex flex-col items-center lg:items-end justify-center w-full space-y-6">
              {/* CURRENT BID CARD */}
              <div
                className={`w-full bg-slate-900/90 rounded-3xl p-6 sm:p-8 border-2 transition-all duration-300 shadow-2xl flex flex-col items-center lg:items-end ${
                  bidPulsing
                    ? 'border-emerald-400 scale-[1.02] shadow-[0_0_50px_rgba(52,211,153,0.3)]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs sm:text-sm font-black tracking-widest uppercase text-emerald-400">
                    Current Highest Bid
                  </span>
                  {bidPulsing && (
                    <span className="text-xs bg-emerald-500 text-black font-extrabold px-2 py-0.5 rounded animate-bounce">
                      NEW BID!
                    </span>
                  )}
                </div>

                {/* Giant Bid Number */}
                <div className="text-7xl sm:text-8xl md:text-9xl font-black font-mono tracking-tighter text-emerald-400 drop-shadow-md">
                  ₹{auctionState.current_bid != null ? auctionState.current_bid : currentPlayer.base_price}
                </div>
              </div>

              {/* LEADING TEAM CARD */}
              <div className="w-full bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-3xl p-6 border-2 border-amber-500/40 shadow-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {leadingTeam ? (
                    leadingTeam.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={leadingTeam.logo_url}
                        alt={leadingTeam.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-2xl bg-slate-950 p-2 border border-slate-700"
                      />
                    ) : (
                      <div
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center font-black text-2xl sm:text-4xl text-white shadow-xl border-2 border-white/20 shrink-0 select-none"
                        style={{ backgroundColor: getTeamPalette(leadingTeam.name).hex }}
                      >
                        {getTeamInitials(leadingTeam.name)}
                      </div>
                    )
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-3xl font-black text-amber-400">
                      🏆
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-black tracking-widest text-amber-400 uppercase">
                      Leading Bidder
                    </p>
                    <p className="text-2xl sm:text-4xl font-black tracking-tight text-white">
                      {leadingTeam ? leadingTeam.name : 'No bids placed yet'}
                    </p>
                  </div>
                </div>

                {!leadingTeam && (
                  <span className="text-xs sm:text-sm font-semibold text-amber-300/80 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/30">
                    Opening bid: ₹{currentPlayer.base_price}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── IDLE / STANDBY STATE ── */
          <div className="text-center space-y-8 max-w-3xl py-12">
            <div className="inline-flex p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl">
              <span className="text-7xl sm:text-9xl animate-pulse">⚽</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-white uppercase">
                {settings.tournament_name || 'Player Auction'}
              </h2>
              <p className="text-lg sm:text-2xl font-medium text-slate-400">
                Ready for the next player… Keep your paddles ready!
              </p>
            </div>

            {/* Last Sold Highlights */}
            {recentSold.length > 0 && (
              <div className="mt-8 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl text-left max-w-xl mx-auto">
                <p className="text-xs font-black tracking-widest text-emerald-400 uppercase mb-3">
                  Latest Acquisition
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl sm:text-2xl font-black text-white">{recentSold[0].name}</p>
                    <p className="text-sm text-slate-400">
                      Sold to <span className="text-amber-300 font-bold">{recentSold[0].teamName || 'Team'}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                      ₹{recentSold[0].sold_price}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── BOTTOM RIBBON: Quick Stats & Footer ── */}
      <footer className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur z-20 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm text-slate-400">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-slate-500 uppercase text-xs font-bold mr-1.5">Teams:</span>
            <span className="font-bold text-white font-mono">{teams.length}</span>
          </div>
          <div>
            <span className="text-slate-500 uppercase text-xs font-bold mr-1.5">Sold Players:</span>
            <span className="font-bold text-emerald-400 font-mono">{recentSold.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span>Projector Mode</span>
          <span className="text-slate-600">·</span>
          <Link href="/teams" className="text-emerald-400 hover:underline font-semibold">
            View Live Teams Board
          </Link>
        </div>
      </footer>

      {/* ── CELEBRATORY "SOLD!" FULLSCREEN OVERLAY ── */}
      {soldMoment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
          {/* Background Ambient Glow */}
          <div className="absolute inset-0 bg-radial from-emerald-500/20 via-transparent to-transparent pointer-events-none" />

          {/* Celebration Card */}
          <div className="relative max-w-2xl w-full bg-gradient-to-b from-slate-900 to-slate-950 border-4 border-amber-400/80 rounded-3xl p-8 sm:p-12 text-center shadow-[0_0_100px_rgba(251,191,36,0.3)] space-y-6">
            {/* BIG GOLD "SOLD!" STAMP */}
            <div className="inline-block transform -rotate-3 scale-110 sm:scale-125 mb-4 animate-bounce">
              <span className="px-8 py-3 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 font-black text-4xl sm:text-6xl uppercase tracking-widest rounded-2xl shadow-2xl border-4 border-white">
                🎉 SOLD! 🎉
              </span>
            </div>

            {/* Player Info */}
            <div className="space-y-2">
              <p className="text-xs font-black tracking-widest text-emerald-400 uppercase">
                Acquired Player
              </p>
              <h3 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
                {soldMoment.playerName}
              </h3>
              {(soldMoment.playerPosition || soldMoment.playerCategory) && (
                <p className="text-base text-slate-400 font-medium">
                  {[soldMoment.playerPosition, soldMoment.playerCategory].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            {/* Winning Team Banner */}
            <div className="py-4 px-6 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center gap-4">
              {soldMoment.teamLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={soldMoment.teamLogo}
                  alt={soldMoment.teamName}
                  className="w-12 h-12 object-contain rounded-xl"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg text-white shadow-md border border-white/20 shrink-0 select-none"
                  style={{ backgroundColor: getTeamPalette(soldMoment.teamName).hex }}
                >
                  {getTeamInitials(soldMoment.teamName)}
                </div>
              )}
              <div className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase">Purchased By</p>
                <p className="text-2xl sm:text-3xl font-black text-amber-300">{soldMoment.teamName}</p>
              </div>
            </div>

            {/* Winning Price */}
            <div className="space-y-1">
              <p className="text-xs font-black tracking-widest text-slate-400 uppercase">Winning Bid</p>
              <p className="text-5xl sm:text-7xl font-black font-mono text-emerald-400 drop-shadow">
                ₹{soldMoment.price}
              </p>
            </div>

            {/* Close / Dismiss button */}
            <button
              onClick={() => setSoldMoment(null)}
              className="mt-4 px-6 py-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold tracking-wider text-slate-300 uppercase transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

