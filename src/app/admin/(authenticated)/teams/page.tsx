import { createClient } from '@/lib/supabase/server';
import type { Team, Settings, Player } from '@/lib/supabase/types';
import TeamsList from './TeamsList';

export interface TeamStatsSummary {
  assignedCount: number;
  soldCount: number;
  spent: number;
}

export default async function TeamsPage() {
  const supabase = await createClient();

  const [teamsRes, settingsRes, playersRes] = await Promise.all([
    supabase.from('teams').select('*').order('created_at', { ascending: true }),
    supabase.from('settings').select('*').eq('id', 1).single(),
    supabase.from('players').select('id, team_id, sold_price, status').not('team_id', 'is', null),
  ]);

  const teams    = (teamsRes.data ?? []) as Team[];
  const settings = settingsRes.data as Settings | null;
  const players  = (playersRes.data ?? []) as Player[];

  // Pre-calculate per-team stats
  const teamStats: Record<string, TeamStatsSummary> = {};
  for (const t of teams) {
    teamStats[t.id] = { assignedCount: 0, soldCount: 0, spent: 0 };
  }

  for (const p of players) {
    if (p.team_id && teamStats[p.team_id]) {
      teamStats[p.team_id].assignedCount += 1;
      if (p.status === 'sold') {
        teamStats[p.team_id].soldCount += 1;
        teamStats[p.team_id].spent += Number(p.sold_price) || 0;
      }
    }
  }

  return <TeamsList teams={teams} settings={settings} teamStats={teamStats} />;
}
