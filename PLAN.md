# Player Auction App — PLAN.md

A simple live auction app for ONE local football tournament event.
Stack: Next.js (App Router) + Supabase (Postgres, Auth, Realtime, Storage) + Vercel. All free tiers.

> For the AI assistant: read this file before every task. Follow the scope below. Do not add features from "Out of scope". Keep code simple and readable.

## 1. How it works
- **Admin console** (`/admin`, login required): the auctioneer sets everything up and runs the auction. The auctioneer enters every bid.
- **Display screen** (`/display`, public, read-only): for the projector. Updates live via Supabase Realtime.
- **Teams board** (`/teams`, public, read-only): each team's squad, remaining purse, slots left.

Nothing is hardcoded. Number of teams, number of players, purse, squad size and bid rules are all entered in the admin UI.

## 2. In scope
1. **Settings screen:** tournament name, logo, theme colour, default purse, min squad size, max squad size, default base price, bid increment steps (e.g. +1 up to 20, then +2), player order mode (manual pick or random next).
2. **Teams screen:** add, edit, delete teams (name, logo, purse). Any number of teams.
3. **Players screen:** add, edit, delete players (name, position, category, base price, photo optional). CSV import as a bonus. Any number of players.
4. **Auction console:** pick or randomise the next player, place a bid for a team, Sold, Unsold, Undo last action. Each team button shows that team's current max allowed bid.
5. **Rule checks (server side only):** bid is higher than current and on a valid increment, team has enough purse, squad not full, reserve rule respected.
6. **Display screen and teams board** with live updates.
7. **Export:** final squads as CSV.
8. **Reset auction:** clears sold/unsold results and bid log but keeps teams and players. Needed for mock runs.

## 3. Out of scope (do not build)
- Team owner logins or bidding from phones
- Multiple tournaments, user accounts, payments
- Bid timers, auto-bid, complex animations, analytics
- Native mobile apps

## 4. Data model (Supabase / Postgres)
- `settings` (single row): tournament_name, logo_url, theme_color, default_purse, min_squad, max_squad, default_base_price, min_base_price, increment_rules (jsonb, e.g. `[{"upTo":20,"step":1},{"upTo":null,"step":2}]`), order_mode (`manual` | `random`)
- `teams`: id, name, logo_url, purse_total
- `players`: id, name, position, category, base_price, photo_url, status (`available` | `sold` | `unsold`), team_id (nullable), sold_price (nullable)
- `auction_state` (single row): current_player_id, current_bid, leading_team_id, status (`idle` | `bidding`)
- `bid_log`: id, player_id, team_id, amount, type (`bid` | `sold` | `unsold` | `undo`), created_at

Team purse remaining = purse_total minus the sum of sold_price for that team's players (compute it, don't store it, so it can never drift).

## 5. Rules (implement as Postgres functions / RPC so each action is atomic)
- `start_player(player_id)`: sets current player, current_bid = base price (no leader yet), status = bidding.
- `place_bid(team_id, amount)`: valid only while bidding. amount must be above current_bid by the correct increment (from `increment_rules`). Team must have `amount <= max_allowed_bid`. Writes bid_log.
- `mark_sold()`: assigns player to leading team at current_bid, sets status = sold, resets auction_state to idle.
- `mark_unsold()`: sets player status = unsold, resets auction_state.
- `undo_last()`: reverses the last bid or the last sold/unsold action using bid_log.
- `reset_auction()`: clears results and log.

**max_allowed_bid for a team** = purse_remaining − (slots still needed to reach min_squad after this player) × min_base_price. Also block if squad is already at max_squad.

## 6. Security
- One admin user via Supabase Auth. All writes require the authenticated admin.
- Public read-only access to the tables needed by `/display` and `/teams`.
- Row Level Security enabled on every table.
- Never put the service-role key in client code.

## 7. Build order
1. Scaffold Next.js, connect Supabase, create tables and RLS.
2. Admin login + Settings, Teams, Players screens.
3. Auction RPC functions with rule checks (test with fake data).
4. Auction console.
5. Display screen and teams board with Realtime.
6. CSV export, reset, polish.
7. Mock auction with fake data a few days before the event. Check the Supabase project is not paused (free projects pause after 7 days of inactivity).

## 8. First Windsurf prompts

**Prompt 1 — scaffold**
> Read PLAN.md. Create a Next.js (App Router, TypeScript, Tailwind) project and connect it to Supabase using environment variables. Write the SQL migration for the tables in section 4 with Row Level Security as in section 6. Do not build any UI yet.

**Prompt 2 — setup screens**
> Read PLAN.md. Build Supabase email login for `/admin` and protect the route. Then build Settings, Teams and Players pages with add, edit and delete. Keep the UI simple and mobile-friendly.

**Prompt 3 — auction logic**
> Read PLAN.md section 5. Write the Postgres functions start_player, place_bid, mark_sold, mark_unsold, undo_last and reset_auction, enforcing all rule checks inside the database. Add a short SQL test script with sample data.

**Prompt 4 — console**
> Read PLAN.md. Build the auction console at `/admin/auction`: choose or randomise the next player, one button per team showing its max allowed bid, Sold, Unsold, Undo. Call the RPC functions only.

**Prompt 5 — display**
> Read PLAN.md. Build `/display` and `/teams` as public read-only pages that update live using Supabase Realtime. Big, projector-friendly text. Show a "SOLD" moment when a player is sold.
