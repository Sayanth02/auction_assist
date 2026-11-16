'use client';

import { useActionState, useState } from 'react';
import { login } from '@/app/actions/auth';

export default function LoginPage() {
  const [actionError, formAction, isPending] = useActionState(login, null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setInfoMessage('');
    let hasErr = false;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Enter your email address.');
      hasErr = true;
    } else if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
      setEmailError('Enter a valid email address.');
      hasErr = true;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Enter your password.');
      hasErr = true;
    } else {
      setPasswordError('');
    }

    if (hasErr) {
      e.preventDefault();
    }
  };

  const handleForgot = () => {
    setInfoMessage(
      'Password recovery is managed by your administrator or through the Supabase authentication dashboard.',
    );
  };

  return (
    <div className="login-app app">
      <header className="topbar">
        <div className="brand" aria-label="Auction Assist">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/auction-assist/icon-512.png"
            alt="Auction Assist"
            className="brand-logo"
            width={44}
            height={44}
          />
          <div>
            <strong className="brand-name">AUCTION ASSIST</strong>
            <small className="brand-meta">Player auction platform</small>
          </div>
        </div>
        <div className="header-tag">The auction experience</div>
      </header>

      <main className="page">
        <div className="layout">
          <section className="hero" aria-label="Welcome to Auction Assist">
            <div className="hero-image" aria-hidden="true" />
            <div className="hero-shade" aria-hidden="true" />
            <div className="hero-shape" aria-hidden="true" />
            <svg
              className="pitch-art"
              viewBox="0 0 180 245"
              fill="none"
              stroke="#c5d3ff"
              strokeWidth="3"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="172" height="237" />
              <path d="M4 122.5h172M55 4v40h70V4M55 241v-40h70v40M74 4v16h32V4M74 241v-16h32v16" />
              <circle cx="90" cy="122.5" r="28" />
              <circle cx="90" cy="122.5" r="2" fill="#c5d3ff" />
            </svg>
            <div className="hero-content">
              <div className="hero-kicker">The auction floor</div>
              <div className="hero-copy">
                <div className="eyebrow">Ready for matchday</div>
                <p className="hero-title">
                  <span>The auction</span>
                  <span>starts</span>
                  <span className="accent">here.</span>
                </p>
                <p className="hero-desc">
                  Every player. Every team. Every bid. Bring your auction to life with Auction Assist.
                </p>
              </div>
              <div className="hero-bottom">
                <span className="hero-bottom-label">One place for it all</span>
                <div className="sport-tags" aria-label="Players, teams and bidding">
                  <span className="sport-tag">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="8" r="3.2" />
                      <path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6" />
                    </svg>
                    Players
                  </span>
                  <span className="sport-tag">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3Z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    Teams
                  </span>
                  <span className="sport-tag">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m13 3-7 10h5l-1 8 8-11h-5l1-7Z" />
                    </svg>
                    Bids
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel-area" aria-labelledby="signinTitle">
            <div className="login-card">
              <div className="card-bar" aria-hidden="true">
                <span className="card-bar-label">Account access</span>
                <span className="card-bar-badge">Sign in</span>
              </div>
              <div className="card-main">
                <div className="form-kicker">Your auction starts here</div>
                <h1 className="form-title" id="signinTitle">
                  Welcome back<span>.</span>
                </h1>
                <p className="form-subtitle">Sign in to your Auction Assist account.</p>

                <form
                  className="signin-form"
                  id="signinForm"
                  action={formAction}
                  onSubmit={handleSubmit}
                  noValidate
                >
                  <div className="field-group">
                    <div className="label-row">
                      <label htmlFor="email">Email address</label>
                    </div>
                    <div className={`field-control ${emailError ? 'is-invalid' : ''}`} id="emailWrap">
                      <svg
                        className="field-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="you@example.com"
                        aria-describedby={emailError ? 'emailError' : undefined}
                        aria-invalid={!!emailError}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (emailError) setEmailError('');
                          if (infoMessage) setInfoMessage('');
                        }}
                        required
                      />
                    </div>
                    {emailError && (
                      <span className="field-error" id="emailError">
                        {emailError}
                      </span>
                    )}
                  </div>

                  <div className="field-group">
                    <div className="label-row">
                      <label htmlFor="password">Password</label>
                      <button className="forgot" id="forgot" type="button" onClick={handleForgot}>
                        Forgot password?
                      </button>
                    </div>
                    <div
                      className={`field-control ${passwordError ? 'is-invalid' : ''}`}
                      id="passwordWrap"
                    >
                      <svg
                        className="field-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="4.5" y="10" width="15" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2" />
                      </svg>
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter password"
                        aria-describedby={passwordError ? 'passwordError' : undefined}
                        aria-invalid={!!passwordError}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (passwordError) setPasswordError('');
                          if (infoMessage) setInfoMessage('');
                        }}
                        required
                      />
                      <button
                        className="password-toggle"
                        id="passwordToggle"
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6S2.5 12 2.5 12Z" />
                          <circle cx="12" cy="12" r="2.7" />
                        </svg>
                        <span id="toggleLabel">{showPassword ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    {passwordError && (
                      <span className="field-error" id="passwordError">
                        {passwordError}
                      </span>
                    )}
                  </div>

                  <button className="submit" id="signinButton" type="submit" disabled={isPending}>
                    <span>{isPending ? 'Signing in…' : 'Sign in'}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 12h15M13 6l6 6-6 6" />
                    </svg>
                  </button>

                  {(actionError || infoMessage) && (
                    <p
                      id="formMessage"
                      className={`form-message ${actionError ? 'is-error' : ''}`}
                      role="status"
                      aria-live="polite"
                    >
                      {actionError || infoMessage}
                    </p>
                  )}
                </form>

                <div className="preview-note">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3Z" />
                    <path d="M12 10v4M12 7.5h.01" />
                  </svg>
                  <span>
                    <strong>Admin console.</strong> Sign in with your tournament administrator credentials.
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="page-footer">
          <span>
            <strong>AUCTION ASSIST</strong> &nbsp;/&nbsp; Player auction platform
          </span>
          <span>Tournament console · Admin access</span>
        </footer>
      </main>
    </div>
  );
}
