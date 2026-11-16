'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';

interface AdminNavProps {
  tournamentName?: string | null;
  logoUrl?: string | null;
  variant?: 'console' | 'settings';
}

const NAV_LINKS = [
  { href: '/admin/auction', label: 'Console' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminNav({ tournamentName, logoUrl }: AdminNavProps) {
  const pathname = usePathname();
  const { confirmNavigation, confirmSignOut } = useUnsavedChanges();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Brand */}
          <Link
            href="/admin/auction"
            className="brand"
            aria-label="Auction console"
            onClick={(e) => {
              if (pathname !== '/admin/auction') {
                if (!confirmNavigation('/admin/auction')) {
                  e.preventDefault();
                }
              }
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="h-10 w-10 object-contain rounded bg-white/10 p-0.5 border border-white/20 shrink-0"
              />
            ) : (
              <svg className="brand-symbol" viewBox="0 0 44 48" aria-hidden="true">
                <path d="M4 3h36v22c0 8-7 14-18 20C11 39 4 33 4 25z" fill="#efff00" />
                <path d="M7 6h30v18c0 7-5.7 12.4-15 17.2C12.7 36.4 7 31 7 24z" fill="#0a1240" />
                <path d="M11 13h22M11 29h22" stroke="#efff00" strokeWidth="1.5" />
                <text x="22" y="25" fill="#efff00" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="900" textAnchor="middle">
                  {tournamentName ? tournamentName.slice(0, 3).toUpperCase() : 'AA'}
                </text>
              </svg>
            )}
            <span className="brand-copy">
              <strong>AUCTION ASSIST</strong>
              {tournamentName ? <small>{tournamentName}</small> : null}
            </span>
          </Link>

          <span className="brand-divider" aria-hidden="true" />

          {/* Navigation links */}
          <nav className="vsl-nav" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`vsl-nav-btn ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    if (!isActive) {
                      if (!confirmNavigation(link.href)) {
                        e.preventDefault();
                      }
                    }
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Header Actions */}
          <div className="header-actions">
            <Link
              href="/display"
              target="_blank"
              className="header-btn"
              aria-label="Open projector preview"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="4" width="18" height="12" rx="1" />
                <path d="M12 16v4m-4 0h8" />
              </svg>
              <span className="hidden sm:inline">Projector</span>
            </Link>

            <Link
              href="/teams"
              target="_blank"
              className="header-btn"
              aria-label="Open team view"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M16 20v-1.5c0-2-1.8-3.5-4-3.5s-4 1.5-4 3.5V20M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 8.5a3 3 0 0 1 0 5.8M19 15.8c1.5.4 2.5 1.4 2.5 2.7V20M6 8.5a3 3 0 0 0 0 5.8M5 15.8c-1.5.4-2.5 1.4-2.5 2.7V20" />
              </svg>
              <span className="hidden sm:inline">Team view</span>
            </Link>

              <form
                action={logout}
                className="inline-flex"
                onSubmit={(e) => {
                  if (!confirmSignOut()) {
                    e.preventDefault();
                  }
                }}
              >
                <button
                  type="submit"
                  className="header-btn signout"
                  aria-label="Sign out"
                >
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M10 5H5v14h5M13 8l4 4-4 4M8 12h9" />
                  </svg>
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
          </div>
      </div>
    </header>
  );
}
