'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Player, Settings, Team } from '@/lib/supabase/types';
import { computeTeamStats } from '@/lib/auction-rules';
import { TeamAvatar } from '@/lib/team-utils';

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

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'purse' | 'squad' | 'name'>('purse');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const supabase = createClient();

  // Realtime updates
  useEffect(() => {
    // 1. Players channel
    const playersChannel = supabase
      .channel('teams_board_players')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        async () => {
          const { data } = await supabase.from('players').select('*');
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

  // Compute team stats dynamically so it can never drift
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

      return {
        ...team,
        ...stats,
        minSlotsNeeded,
        maxSlotsRemaining,
      };
    });
  }, [teams, players, settings]);

  // Filter & Sort
  const filteredAndSortedTeams = useMemo(() => {
    return teamCards
      .filter((team) => {
        const query = searchTerm.toLowerCase();
        const matchesTeam = team.name.toLowerCase().includes(query);
        const matchesPlayer = team.players.some((p) => p.name.toLowerCase().includes(query));
        return matchesTeam || matchesPlayer;
      })
      .sort((a, b) => {
        if (sortBy === 'purse') return b.purse_remaining - a.purse_remaining;
        if (sortBy === 'squad') return b.squad_size - a.squad_size;
        return a.name.localeCompare(b.name);
      });
  }, [teamCards, searchTerm, sortBy]);

  // Summary Metrics
  const summary = useMemo(() => {
    const soldPlayers = players.filter((p) => p.status === 'sold');
    const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.sold_price || 0), 0);
    const totalPurse = teams.reduce((sum, t) => sum + t.purse_total, 0);
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
      remainingPurse: totalPurse - totalSpent,
      topBuy,
    };
  }, [teams, players]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-black">
      {/* ── HEADER ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {settings.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Logo" className="w-10 h-10 object-contain rounded-lg" />
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
                {settings.tournament_name || 'Tournament Teams'}
              </h1>
              <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                Live Squads & Purse Board
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            <Link
              href="/display"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors shadow-lg flex items-center gap-1.5"
            >
              <span>📺</span> Projector View
            </Link>
            <Link
              href="/admin/auction"
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors"
            >
              Admin Console
            </Link>
          </div>
        </div>
      </header>

      {/* ── METRICS OVERVIEW BAR ── */}
      <div className="bg-slate-900/40 border-b border-slate-800/60 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase">Total Teams</p>
            <p className="text-2xl font-black text-white font-mono mt-0.5">{summary.totalTeams}</p>
          </div>
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase">Players Sold</p>
            <p className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
              {summary.soldCount}{' '}
              <span className="text-sm font-normal text-slate-500">/ {summary.totalPlayers}</span>
            </p>
          </div>
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase">Total Spent</p>
            <p className="text-2xl font-black text-amber-400 font-mono mt-0.5">
              ₹{summary.totalSpent}{' '}
              <span className="text-xs font-normal text-slate-500">/ ₹{summary.totalPurse}</span>
            </p>
          </div>
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase">Top Buy</p>
            <p className="text-lg font-black text-white truncate mt-1">
              {summary.topBuy ? (
                <>
                  {summary.topBuy.name}{' '}
                  <span className="text-emerald-400 font-mono text-base font-bold">
                    (₹{summary.topBuy.sold_price})
                  </span>
                </>
              ) : (
                <span className="text-slate-500 font-normal text-sm">None yet</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── CONTROLS: Search & Sorting ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Search box */}
          <div className="w-full sm:w-80 relative">
            <input
              type="search"
              placeholder="Search team or player…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 text-white placeholder-slate-500 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Sort tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto">
            <button
              onClick={() => setSortBy('purse')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                sortBy === 'purse'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Purse Remaining
            </button>
            <button
              onClick={() => setSortBy('squad')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                sortBy === 'squad'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Squad Size
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                sortBy === 'name'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Name (A-Z)
            </button>
          </div>
        </div>

        {/* ── TEAMS GRID ── */}
        {filteredAndSortedTeams.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800">
            <p className="text-slate-400 text-lg">No teams found matching your query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedTeams.map((team) => {
              const isExpanded = expandedTeamId === team.id;
              const squadPercent = Math.min(100, (team.squad_size / settings.max_squad) * 100);
              const minSquadPercent = Math.min(100, (settings.min_squad / settings.max_squad) * 100);

              return (
                <div
                  key={team.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 transition-all shadow-xl flex flex-col justify-between space-y-5"
                >
                  {/* Team Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <TeamAvatar
                          logoUrl={team.logo_url}
                          name={team.name}
                          sizeClassName="w-12 h-12 text-base"
                        />
                        <div>
                          <h2 className="text-lg font-black text-white tracking-tight">{team.name}</h2>
                          <p className="text-xs text-slate-400">
                            Initial Purse: <span className="font-mono font-medium">₹{team.purse_total}</span>
                          </p>
                        </div>
                      </div>

                      {/* Remaining Purse Badge */}
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                          Remaining
                        </span>
                        <span className="text-2xl font-black font-mono text-emerald-400">
                          ₹{team.purse_remaining}
                        </span>
                      </div>
                    </div>

                    {/* Stats Strip */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-800/80 text-center">
                      <div className="bg-slate-950/60 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Spent</span>
                        <span className="text-sm font-bold font-mono text-slate-200">₹{team.spent}</span>
                      </div>
                      <div className="bg-slate-950/60 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Max Bid</span>
                        <span className="text-sm font-bold font-mono text-amber-300">
                          {team.max_bid > 0 ? `₹${team.max_bid}` : 'Full'}
                        </span>
                      </div>
                      <div className="bg-slate-950/60 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Slots Left</span>
                        <span className="text-sm font-bold font-mono text-slate-200">
                          {team.maxSlotsRemaining}
                        </span>
                      </div>
                    </div>

                    {/* Squad Capacity Bar */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-400">
                        <span>
                          Squad: <strong className="text-white">{team.squad_size}</strong> players
                        </span>
                        <span>
                          {team.minSlotsNeeded > 0 ? (
                            <span className="text-amber-400 font-bold">
                              Needs {team.minSlotsNeeded} for min ({settings.min_squad})
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold">Min met ({settings.min_squad})</span>
                          )}
                        </span>
                      </div>

                      <div className="relative h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        {/* Minimum Squad Target Marker */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-500 z-10"
                          style={{ left: `${minSquadPercent}%` }}
                          title={`Min squad target: ${settings.min_squad}`}
                        />
                        {/* Progress Fill */}
                        <div
                          className={`h-full transition-all duration-500 ${
                            team.squad_size >= settings.min_squad ? 'bg-emerald-500' : 'bg-amber-400'
                          }`}
                          style={{ width: `${squadPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── SQUAD PLAYERS LIST ── */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Players ({team.players.length})
                      </span>
                      {team.players.length > 3 && (
                        <button
                          onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                          className="text-xs font-semibold text-emerald-400 hover:underline"
                        >
                          {isExpanded ? 'Show less' : `Show all (${team.players.length})`}
                        </button>
                      )}
                    </div>

                    {team.players.length === 0 ? (
                      <p className="text-xs text-slate-500 italic mt-2 py-3 bg-slate-950/40 rounded-xl text-center">
                        No players acquired yet.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {(isExpanded ? team.players : team.players.slice(0, 3)).map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-950/60 border border-slate-800/80"
                          >
                            <div className="truncate mr-2">
                              <span className="font-bold text-slate-200">{p.name}</span>
                              {(p.position || p.category) && (
                                <span className="text-slate-500 text-[10px] ml-1.5">
                                  {[p.position, p.category].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-emerald-400 shrink-0">
                              ₹{p.sold_price}
                            </span>
                          </div>
                        ))}

                        {!isExpanded && team.players.length > 3 && (
                          <button
                            onClick={() => setExpandedTeamId(team.id)}
                            className="w-full text-center py-1.5 text-xs text-slate-400 hover:text-white bg-slate-950/30 rounded-lg transition-colors"
                          >
                            + {team.players.length - 3} more players…
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

