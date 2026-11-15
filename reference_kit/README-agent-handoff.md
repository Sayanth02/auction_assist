# VSL projector and signing reveal — implementation handoff

## Goal and scope

Implement the approved projector experience in the **existing application**, using the current design as the visual reference and the user's **original 1080p stadium video** as the signing-reveal background. This is not a request to deploy the standalone demo or change the auction's selling rules.

The visual scope is the auction stage, the approved Teams board, and the player-signing reveal. If the real app already implements an approved screen, keep it; if not, reproduce the reference using real application data. Do **not** redesign the approved Teams board, replace it with a static picture, or lose its existing controls. The admin console, auction rules, unrelated pages and database schema are outside the scope unless an essential change is identified and explained first.

**We have not inspected the real repository in preparing this handoff.** Treat the paths and flow below as leads from an earlier coding-agent report, not verified facts. Inspect the code and actual schema before implementing.

## Files in this reference kit

| File | Purpose |
| --- | --- |
| `reference/signing-preview.html` | Standalone interactive visual/motion reference. It embeds a low-resolution background converted from the user's GIF. It is **not production code or the 1080p original**. |
| `reference/signing-demo.mp4` | What the complete signing moment looks and sounds like. The background inside it came from the low-resolution GIF and the player/copy are baked into the recording. **Do not use this composite video as the app background.** |
| `reference/signing-reveal.png` | Still showing the intended composition. |
| `reference/projector-reference.html` | Earlier clean auction-stage and Teams-board design reference. |
| `reference/approved-teams-board.png` | Approved board appearance at 1920 × 1080; visual reference only, not a data source. |
| `reference/schema-user-supplied-historical.png` | User's earlier schema screenshot. It may be out of date: verify the current database and migrations. |
| `assets/signing-sound.mp3` | Separate signing soundtrack used in the preview, approximately nine seconds. |

The original **1080p source video is not in this kit**. The user has it and will supply it directly to you or identify its location in your workspace. Ask for its path if necessary. Do not quietly substitute the GIF-derived preview or claim to have used the 1080p video when you have not.

The demo names, images, prices, team names, logos, counts and sale are examples only. Never hard-code “Anvish KM”, “Demo FC”, ₹1,500, sample logos or snapshot counts into the live application. The 1080p source must be the **background-only clip**, not the composite reference demo.

## 1. Inspect the existing code before changing it

The previous coding-agent report described the following; **verify each point in this repository**:

- `AuctionConsole.tsx` invokes `markSold()` in `src/app/actions/auction.ts`.
- The action authenticates the admin and calls Supabase RPC `mark_sold()`.
- `supabase/migrations/0002_auction_functions.sql` reportedly records the sale and a `bid_log` row of type `sold` atomically, then resets relevant `auction_state` fields.
- `DisplayScreen.tsx` reportedly triggers the sold celebration from both a player update and a sold-log insert, resulting in duplicate celebrations. Existing player/auction updates may still be needed to keep screen data fresh.
- The earlier schema image shows `bid_log.id`, `player_id`, `team_id`, `amount`, `type`, `created_at` and `seq_id`; the prior report described `id` as a UUID, `seq_id` as an identity bigint, and an undo log row of type `undo`. Confirm exact names, payloads, undo relationship and permissions.

Find the actual projector route/components, display-mode navigation, Supabase client/channel lifecycle, sale and undo functions, photo storage/URL configuration, existing animation library, test framework, package manager and deployment asset conventions. Prefer the project's existing patterns.

## 2. Supply and place the real video

1. Obtain the user's original 1080p MP4. Confirm its path, duration, dimensions, codec and whether sparks are already present; inspect it rather than assuming it exactly matches the GIF.
2. Put it where the existing web app serves static media. For a Next.js-style app, `public/media/signing-background.mp4` (served as `/media/signing-background.mp4`) is an **example**, not a claim that this directory already exists. If the project uses another asset pipeline or managed storage, follow it.
3. Generate a matching still poster from the original video, using the project's tooling. For example, if FFmpeg is available: `ffmpeg -i signing-background.mp4 -frames:v 1 -q:v 2 signing-poster.jpg`. Retain any required watermark/attribution. A poster is a fallback, not a replacement for the 1080p video.
4. Use a browser-supported format such as H.264/yuv420p in an MP4 container if the supplied file needs compatibility conversion. Do not reduce the source to the 480 × 270 GIF. Avoid embedding giant base64 media in application source; use the project's media/asset convention and discuss large-file hosting or Git LFS if needed.
5. The video is background-only. Render it **muted**, with `playsInline`, and keep the signing soundtrack separate. Use a same-origin/appropriately configured URL, not a browser-facing `localhost` URL.

## 3. Connect the real sale safely

- Keep the existing authenticated admin action and the server/database sale transaction as the source of truth. Do not record a sale or mutate the database merely to play an animation.
- After verifying the actual schema, use a **committed sold-log INSERT** as the celebration trigger. Obtain player ID, team ID and amount from that committed event or an authoritative sale snapshot; do not rely on `auction_state.current_player_id` or the leading bidder still being populated after the sale reset.
- Resolve the real player's current name, position/category and `photo_url`, plus the sold team's real name/logo, as available. Capture a stable per-event display snapshot before playback/queueing. Handle unavailable or unauthorized data gracefully without inventing a team, price or player.
- If both a player `UPDATE` and a sold-log `INSERT` currently launch the animation, remove the duplicate **animation trigger** from the player update while preserving any subscription needed to refresh ordinary state. Do not also celebrate on the admin button click before the transaction commits.
- Use the sold event's real UUID to deduplicate callbacks per projector session, including React re-renders/Strict Mode and duplicate subscriptions. Clean up channels, listeners and timers on unmount. Delivering one celebration per unique received event is the goal; do not claim globally exactly-once delivery from a best-effort realtime connection.
- Queue distinct consecutive sales so they do not overwrite one another. Resolve events in a way that preserves the chosen queue order even if fetching their display data completes out of order.
- Do not discard an otherwise new, unprocessed realtime event solely because its `seq_id` is lower than a previously seen value: an identity value alone is not a reliable commit-order cutoff. Use event UUID deduplication and the actual realtime/transaction semantics.
- On projector startup or reconnect, reconcile the authoritative current auction and board state without replaying old sales as new celebrations. Subscribe and buffer genuinely new callbacks during any initial/reconnect state fetch so a sale arriving during that transition is not silently lost. Test this race explicitly.
- Inspect the real undo flow. If an undo affects a queued sale, remove it; if it affects the active sale, dismiss it and refresh state. Do not cancel an unrelated sale. Use the actual event relationship/authoritative data; if the schema cannot reliably identify the affected sale, report that limitation and propose a safe fix before inventing a relationship or applying a migration.
- Confirm the display's existing Supabase Realtime publication and read permissions/RLS allow the intended projector role to receive only the needed records. Do not solve a permission problem by exposing privileged credentials or broadly weakening RLS.

## 4. Match the approved projector visuals

- Reproduce the auction-stage layout and the approved Teams board **where they are not already implemented**, binding them to live state. If the approved board is already in place, leave its appearance and behavior alone. Keep filtering, sorting, view switching, fullscreen and existing accessibility working.
- Use the complete original player photograph, including its background. Use a contained image (`object-fit: contain` or equivalent), not a cutout or an automatically cropped portrait. Handle missing/failed photos and varied portrait, landscape and square aspect ratios.
- Use the reference's football-transfer language: “HERE WE GO!”, “DONE DEAL”, then the actual **player → team** and actual sale fee. Use existing currency formatting and real data.
- The reference animation is approximately nine seconds: an intro, a card flip, the signing impact and badge around 2.1–2.2 seconds, then a fade back to the underlying screen. Keep a similarly polished, readable composition. Avoid showing sample/demo labels or fake data in production.
- Show the celebration without destroying the underlying view or blocking background state updates. After it closes, return to the screen/view the operator had selected, with authoritative current data. Keep the Teams board's design itself unchanged.
- The user's submitted clip already showed cold-spark machines firing on both sides. If the **original 1080p clip** also includes those sparks, use them and do **not** add a second misaligned set on top. If the source does not include sparks, add a lightweight, synchronized two-sided effect. If playback fails, use the poster and, when motion is allowed, a lightweight two-sided fallback if practical; never break the auction flow.
- Preserve the source video's framing and any required watermark. Avoid full-screen effects or per-particle shadows that cause projector lag. Respect reduced-motion settings with a static, readable result.

## 5. Playback and operator controls

- Use a responsive, muted background video with a matching static poster if playback fails. The preview plays the supplied clip **once**, without a mid-reveal loop jump; the user clip's end and start do not form an obvious seamless loop. If it ends before the overlay closes, hold/fade the last frame rather than abruptly restart it.
- In the GIF-based reference, the background's first frame is held for roughly 1.1 seconds so its existing sparks begin close to the card/impact at roughly 2.1 seconds. Check the actual 1080p video and adjust the delay only if it improves synchronization. The soundtrack begins at reveal start; its swell is around 2 seconds.
- Browser autoplay policies can block unmuted sound. Give the projector operator an explicit **Enable sound**/retry gesture, reuse the unlocked audio element or audio context as appropriate, and handle `play()` rejection visibly and gracefully. Do not assume a saved preference bypasses browser policy. A sound-blocked device must still show the signing and return to the auction.
- Provide accessible mute and skip controls; ensure skip, natural completion, navigation, rapid consecutive events and unmount all stop/reset media and restore focus/state. Do not bake the soundtrack into the background video.
- Ensure the projector remains usable at 1920 × 1080 and adapts to narrower screens; the complete photo and key copy must remain legible. Do not modify the real app's auction data for preview/testing.

## 6. Tests and acceptance checks

Use mocked events or a safe development/staging dataset. **Do not perform real sales against production merely to test the animation.** At minimum:

1. A committed sale produces one reveal with the correct player, original photo, real team and price; duplicate callbacks for the same UUID do not replay it.
2. Two different sales received close together play in order. A matching undo cancels a queued/active reveal; an unrelated undo does not.
3. A new realtime event with a lower `seq_id` than another delivered event is not dropped merely because of that number. Startup/reconnect refreshes state, does not replay stale celebrations, and does not lose a fresh event received during the reconciliation window.
4. Background video plays from the supplied 1080p file with no extra duplicate sparks, stays muted, plays once, and falls back to its poster when unavailable. Sound can be enabled, muted and retried after rejection; skip and natural finish work.
5. Long names, missing photos, portrait/landscape images, long team names and changing sale state do not overlap or crop the player's full photo.
6. Teams board appearance and controls match the approved reference and retain real data. If comparing screenshots, compare identical app state/data; the sample reference values are not production data.
7. Test at 1920 × 1080, on the actual projector/browser if available, and on at least one narrow viewport. Check reduced motion, keyboard access, fullscreen and offline/blocked media behavior as relevant to the actual deployment.
8. Run the repository's existing type checks, tests and lint/build commands. Add focused tests for the new event/queue/media behavior where practical.

## 7. Report back before production use

Explain which files changed, the actual verified event source and undo mapping, how to supply/replace the 1080p video, any optional dependency or configuration, how the projector operator enables sound, tests run and any limitations. State clearly whether you could test against the actual 1080p file. Do not ask the user to paste database passwords, service-role keys or other secrets into chat.

## Credits

The provided soundtrack is an original effect mixed with a quiet layer of “Crowd Cheer” by FoolBoyMedia, CC0 1.0: <https://freesound.org/people/FoolBoyMedia/sounds/397434/>. Keep a credit in the project's asset notices if using it.

The standalone HTML reference embeds Anime.js 3.2.2 (MIT) and the DM Sans/Barlow font license notices. If extracting/reusing those assets or libraries, retain the relevant licenses; otherwise prefer libraries and fonts already used by the project. The user supplies the 1080p source video separately and should confirm its usage rights for their deployment.
