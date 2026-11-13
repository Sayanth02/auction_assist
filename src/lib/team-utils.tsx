/**
 * src/lib/team-utils.tsx
 *
 * Helpers and components for team logo rendering, color generation, and initials.
 */

import React from 'react';
import { getInitials } from '@/lib/player-constants';

export interface TeamPalette {
  bg: string;
  text: string;
  hex: string;
  border: string;
}

export const TEAM_PALETTES: readonly TeamPalette[] = [
  { bg: 'bg-emerald-600', text: 'text-white', hex: '#059669', border: 'border-emerald-400' },
  { bg: 'bg-blue-600',    text: 'text-white', hex: '#2563eb', border: 'border-blue-400' },
  { bg: 'bg-indigo-600',  text: 'text-white', hex: '#4f46e5', border: 'border-indigo-400' },
  { bg: 'bg-violet-600',  text: 'text-white', hex: '#7c3aed', border: 'border-violet-400' },
  { bg: 'bg-purple-600',  text: 'text-white', hex: '#9333ea', border: 'border-purple-400' },
  { bg: 'bg-rose-600',    text: 'text-white', hex: '#e11d48', border: 'border-rose-400' },
  { bg: 'bg-amber-600',   text: 'text-white', hex: '#d97706', border: 'border-amber-400' },
  { bg: 'bg-orange-600',  text: 'text-white', hex: '#ea580c', border: 'border-orange-400' },
  { bg: 'bg-teal-600',    text: 'text-white', hex: '#0d9488', border: 'border-teal-400' },
  { bg: 'bg-cyan-600',    text: 'text-white', hex: '#0891b2', border: 'border-cyan-400' },
  { bg: 'bg-fuchsia-600', text: 'text-white', hex: '#c026d3', border: 'border-fuchsia-400' },
  { bg: 'bg-sky-600',     text: 'text-white', hex: '#0284c7', border: 'border-sky-400' },
] as const;

export function getTeamPalette(name: string): TeamPalette {
  if (!name) return TEAM_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % TEAM_PALETTES.length;
  return TEAM_PALETTES[idx];
}

export function getTeamInitials(name: string): string {
  return getInitials(name);
}

export function TeamAvatar({
  logoUrl,
  name,
  className = '',
  sizeClassName = 'w-12 h-12 text-sm',
  imgClassName = '',
}: {
  logoUrl?: string | null;
  name: string;
  className?: string;
  sizeClassName?: string;
  imgClassName?: string;
}) {
  const palette = getTeamPalette(name);
  const initials = getTeamInitials(name);

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClassName} object-contain rounded-xl bg-slate-950 p-1 border border-slate-800 shrink-0 ${imgClassName} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClassName} rounded-full flex items-center justify-center font-black ${palette.bg} ${palette.text} shadow-sm shrink-0 border border-white/20 select-none ${className}`}
      style={{ backgroundColor: palette.hex }}
      title={name}
    >
      <span>{initials}</span>
    </div>
  );
}

