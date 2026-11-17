'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getTeamPalette, getTeamInitials } from '@/lib/team-utils';
import { getInitials } from '@/lib/player-constants';

function formatCurrency(val: number): string {
  return `₹${Number(val || 0).toLocaleString('en-IN')}`;
}

export interface SoldRevealData {
  eventId: string;
  seqId?: number;
  playerId: string;
  playerName: string;
  playerPosition: string | null;
  playerCategory: string | null;
  photoUrl: string | null;
  teamId: string | null;
  teamName: string;
  teamLogo: string | null;
  price: number;
}

interface SoldRevealOverlayProps {
  data: SoldRevealData;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

export const SoldRevealOverlay: React.FC<SoldRevealOverlayProps> = ({
  data,
  soundEnabled,
  onToggleSound,
  onFinish,
  onSkip,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  const [videoPlaying, setVideoPlaying] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [teamLogoError, setTeamLogoError] = useState(false);

  // Fallback palette for the winning team
  const teamPalette = getTeamPalette(data.teamName);
  const teamInitials = getTeamInitials(data.teamName);

  // Play audio handling with policy recovery
  const handleSoundClick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      onToggleSound();
      return;
    }

    if (audioBlocked) {
      // User clicked specifically to unlock blocked audio
      audio.muted = false;
      audio
        .play()
        .then(() => {
          setAudioBlocked(false);
        })
        .catch(() => {
          setAudioBlocked(true);
        });
      return;
    }

    // Toggle mute
    if (soundEnabled) {
      audio.muted = true;
      audio.pause();
    } else {
      audio.muted = false;
      audio
        .play()
        .then(() => {
          setAudioBlocked(false);
        })
        .catch(() => {
          setAudioBlocked(true);
        });
    }
    onToggleSound();
  }, [audioBlocked, soundEnabled, onToggleSound]);

  // Video playback initialization
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reducedMotion) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setVideoPlaying(true);
          })
          .catch(() => {
            setVideoPlaying(false);
          });
      }
    }

    return () => {
      video.pause();
    };
  }, [data.eventId]);

  // Audio playback initialization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    if (soundEnabled) {
      audio.muted = false;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setAudioBlocked(false);
          })
          .catch((err) => {
            console.warn('Projector signing audio blocked by browser autoplay policy:', err);
            setAudioBlocked(true);
          });
      }
    } else {
      audio.muted = true;
      audio.pause();
    }

    return () => {
      audio.pause();
    };
  }, [data.eventId, soundEnabled]);

  // Total reveal sequence timer (9 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 9000);

    return () => clearTimeout(timer);
  }, [data.eventId, onFinish]);

  // Focus the skip control on mount and handle Escape key
  useEffect(() => {
    if (skipButtonRef.current) {
      skipButtonRef.current.focus({ preventScroll: true });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  return (
    <div
      className="transfer-reveal is-playing"
      id="soldReveal"
      role="dialog"
      aria-modal="true"
      aria-label="Player Signing Reveal"
    >
      {/* ── BACKGROUND VIDEO & POSTER ARENA ── */}
      <div className="reveal-arena" aria-hidden="true">
        {/* Static poster displayed if video fails or while buffering */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/videos/football_arena_poster.jpg"
          alt=""
          className="reveal-background-poster"
        />

        {/* 1080p background video (muted, single play) */}
        <video
          ref={videoRef}
          className={`reveal-background-video ${videoPlaying ? 'is-visible' : ''}`}
          muted
          autoPlay
          playsInline
          preload="auto"
          tabIndex={-1}
          onPlay={() => setVideoPlaying(true)}
          onPlaying={() => setVideoPlaying(true)}
          onEnded={() => {
            // Keep the last frame held steadily
            if (videoRef.current) videoRef.current.pause();
          }}
        >
          <source src="/videos/football_arena.mp4" type="video/mp4" />
          <source src="/videos/footabll_arena.mp4" type="video/mp4" />
        </video>
      </div>

      <div className="reveal-arena-sparks" aria-hidden="true" />
      <div className="reveal-shade" aria-hidden="true" />
      <div className="reveal-flash" aria-hidden="true" />
      <div className="reveal-curtain" aria-hidden="true" />

      {/* ── TOP BAR: BRAND & OPERATOR CONTROLS ── */}
      <header className="reveal-topbar">
        <div className="transfer-brand" aria-hidden="true">
          <svg viewBox="0 0 48 54">
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
          <div>
            <strong>VSL</strong>
            <small>SEASON 04</small>
          </div>
        </div>

        <div className="reveal-actions">
          <span className="reveal-demo-tag">
            <span>OFFICIAL SIGNING</span>
          </span>

          {/* Sound Toggle / Retry Button */}
          <button
            type="button"
            className={`reveal-control ${audioBlocked ? 'is-blocked' : ''}`}
            id="soundToggle"
            aria-pressed={soundEnabled && !audioBlocked}
            aria-label={
              audioBlocked
                ? 'Sound blocked by browser. Click to enable'
                : soundEnabled
                ? 'Mute signing sound'
                : 'Turn signing sound on'
            }
            onClick={handleSoundClick}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor">
              {audioBlocked ? (
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              ) : soundEnabled ? (
                <path d="M3 9v6h4l5 4V5L7 9H3zm12.5-2.5v2a4 4 0 0 1 0 7v2a6 6 0 0 0 0-11zm0-3v2a7 7 0 0 1 0 13v2a9 9 0 0 0 0-17z" />
              ) : (
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 4v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              )}
            </svg>
            <span id="soundLabel">
              {audioBlocked
                ? 'SOUND BLOCKED · CLICK TO UNLOCK'
                : soundEnabled
                ? 'SOUND ON'
                : 'SOUND OFF'}
            </span>
          </button>

          {/* Skip Button */}
          <button
            ref={skipButtonRef}
            type="button"
            className="reveal-control"
            id="skipSoldDemo"
            onClick={onSkip}
            title="Skip animation and return to auction (Esc)"
          >
            Skip
          </button>
        </div>
      </header>

      {/* ── INTRO BANNER ("HERE WE GO!") ── */}
      <div className="reveal-intro" aria-hidden="true">
        <div className="intro-eyebrow">VSL / TRANSFER ALERT</div>
        <h2 className="intro-heading">
          <span className="intro-word">HERE</span> <span className="intro-word">WE</span>{' '}
          <span className="intro-word">GO</span>
          <span className="intro-punctuation">!</span>
        </h2>
        <div className="intro-bottom">THE SIGNING MOMENT</div>
      </div>

      {/* ── REVEAL STAGE & CARD FLIP ── */}
      <div className="reveal-stage" aria-hidden="true">
        <div className="reveal-stack">
          {/* Headline */}
          <h2 className="final-headline">
            HERE WE GO<span>!</span>
          </h2>

          {/* Badge */}
          <div className="deal-badge">DONE DEAL</div>

          {/* 3D Flip Card */}
          <div className="portrait-stage">
            <div className="transfer-card">
              {/* Back Face: Buying Team Crest */}
              <div
                className="transfer-card-face transfer-card-back"
                style={{
                  boxShadow: `0 0 50px rgba(0, 0, 0, 0.8), inset 0 0 60px ${teamPalette.hex}33`,
                  borderColor: `${teamPalette.hex}77`,
                }}
              >
                <div className="card-back-crest-wrap">
                  <div className="card-back-brand">
                    <span className="card-back-pill">OFFICIAL SIGNING</span>
                  </div>

                  <div className="card-back-crest-stage">
                    {data.teamLogo && !teamLogoError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.teamLogo}
                        alt={data.teamName}
                        className="card-back-crest-img"
                        onError={() => setTeamLogoError(true)}
                      />
                    ) : (
                      <div
                        className="card-back-crest-fallback"
                        style={{ backgroundColor: teamPalette.hex }}
                      >
                        {teamInitials}
                      </div>
                    )}
                  </div>

                  <div className="card-back-details">
                    <span className="card-back-kicker">NEW SIGNING FOR</span>
                    <strong className="card-back-team-title">{data.teamName}</strong>
                    <small className="card-back-sub">VSL SEASON 04</small>
                  </div>
                </div>
              </div>

              {/* Front Face with Full Uncut Photo */}
              <div className="transfer-card-face transfer-card-front">
                <div className="portrait-frame" id="signedPhotoFrame">
                  {data.photoUrl && !photoError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      id="signedPhoto"
                      src={data.photoUrl}
                      alt={data.playerName}
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="portrait-fallback">
                      <span>{getInitials(data.playerName)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Transfer Copy Details */}
          <div className="transfer-copy">
            <div className="player-name">{data.playerName}</div>

            {/* Unified, high-impact single-line buying statement */}
            <div
              className="buying-statement"
              role="text"
              aria-label={`${data.playerName} sold to ${data.teamName} for ${formatCurrency(data.price)}`}
            >
              <span className="buying-action">SOLD TO</span>
              <span className="buying-team-group">
                {data.teamLogo && !teamLogoError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.teamLogo}
                    alt={data.teamName}
                    className="buying-team-crest"
                    onError={() => setTeamLogoError(true)}
                  />
                ) : (
                  <div
                    className="buying-team-crest-fallback"
                    style={{ backgroundColor: teamPalette.hex }}
                  >
                    {teamInitials}
                  </div>
                )}
                <strong className="buying-team-name">{data.teamName}</strong>
              </span>
              <span className="buying-divider" aria-hidden="true">
                ·
              </span>
              <span className="buying-fee-group">
                <span className="buying-fee-label">FEE</span>
                <strong className="buying-fee-amount">{formatCurrency(data.price)}</strong>
              </span>
            </div>

            {(data.playerPosition || data.playerCategory) && (
              <div className="player-meta-tag">
                {[data.playerPosition, data.playerCategory].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="reveal-footer">
        <span>VSL AUCTION · OFFICIAL SIGNING REVEAL</span>
        <span>AUDIO POWERED BY THE VENUE SYSTEM</span>
      </footer>

      {/* ── AUDIO ELEMENT ── */}
      <audio ref={audioRef} preload="auto">
        <source src="/sounds/signing-sound.mp3" type="audio/mpeg" />
        <source src="/videos/signing-sound.mp3" type="audio/mpeg" />
      </audio>
    </div>
  );
};
