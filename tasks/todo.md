# Dashboard ink-street visual pass

## Goal and acceptance criteria
- Restyle the dashboard home with a vivid, playful ink-street game atmosphere without using Splatoon logos, characters, or copied assets.
- Preserve all current actions, API calls, data, and responsive behavior.
- Keep text readable, add visible keyboard focus, and respect reduced-motion preferences.
- Run the frontend build and show the changed dashboard in the local preview.

## Working notes
- Scope: dashboard shell, home hero, home cards, and navigation styling only.
- Existing baseline: frontend build passes with existing chunk-size and mixed dynamic/static import warnings.
- Local preview at `127.0.0.1:5173` was not responding; start Vite after the edit.
- No backend, database, dependency, or asset changes.

## Checklist
- [x] Inspect current dashboard, home component, project rules, and Git status.
- [x] Run the baseline frontend build and check preview availability.
- [x] Implement the dashboard visual refresh in existing components/styles.
- [x] Verify the frontend build and HTTP preview response.
- [x] Record results and remaining warnings.

## Results
- Replaced the home brand-only header with a Japanese field-report hero and added ink-street styling to the dashboard shell, HUD cards, quick actions, and mobile navigation.
- Kept actions, API calls, and data logic unchanged; added visible keyboard focus and reduced-motion handling.
- `npm run build --workspace=@my-app/frontend` passes. Existing warnings remain for mixed static/dynamic imports and the large JS bundle.
- `git diff --check` passes. `http://127.0.0.1:5173/dashboard` responds HTTP 200; the preview was queued in the Codex panel. Automated screenshot capture was unavailable because the computer-use helper failed to start.
- No backend, D1, dependency, or deployment changes. Changes remain uncommitted.

## Multi-team battle implementation

### Goal and acceptance criteria
- A team leader can select one or more opposing teams for a single period-based battle.
- Each invited team leader responds independently; any decline rejects the event, and scoring begins only after every invited team accepts.
- Battle results show each team's raw point total; team-size normalization is intentionally not performed.
- Only verified live push-up records during the battle window count, with roster snapshots per team's acceptance.
- Local D1 only; no Cloudflare remote migration, deployment, or Git commit.

### Working notes
- Preserve the already-applied `0024_add_team_battles.sql`; add an additive `0025` migration for participant invitations and legacy backfill.
- The legacy `team_battles.team_b_id` remains as a compatibility field; new behavior uses participant rows.
- The current local implementation has user changes in dashboard/design files; avoid unrelated edits.

### Checklist
- [x] Update the shared Zod contract for multiple opposing teams and participant score/status summaries.
- [x] Add a D1 migration for participant invitation state and backfill existing battles.
- [x] Update create/respond/list APIs and keep realtime-only score accounting.
- [x] Update the team UI to multi-select opponents and show a per-team scoreboard.
- [x] Add schema regression tests and run typecheck, tests, build, local migration, and preview checks.

### Results
- Added participant-based invitations. All invited team leaders must accept before the event is scheduled; one decline cancels the event.
- The team tab now uses checkboxes (up to 50 opponents) and shows each team's raw points and invitation state. No team-size normalization is performed.
- `0025_add_multi_team_battle_participants.sql` was applied to local D1 only, with a backfill for existing two-team battles.
- `npm run typecheck`, `npx vitest run` (12 tests), `npm run build`, and `git diff --check` pass.
- Local API smoke checks passed for multi-team listing, staged acceptances, and cancellation on decline. Temporary test rows were removed.
- The local dashboard responds HTTP 200. No remote D1, deployment, or Git commit was changed.

## Running-first activity modes and team territory battles

### Goal and acceptance criteria
- A run is recorded once with its personal/team mode and the team selected at that time; later membership changes never reassign it.
- Every valid run contributes to the runner's personal distance. Only team-mode runs contribute to the snapshotted team's cumulative distance.
- Personal and team territory layers are separate. Team polygons from different members merge geometrically, with overlap counted once and member attribution retained in run records.
- Team battles use only online-accepted activity during the battle window. Distance and territory net change are reported separately; pre-existing area is not carried into the battle score.
- Existing territories become personal territories. Existing run distance is carried over only as a clearly marked best-effort estimate; it is never backfilled as team activity.
- The app displays an online-required state offline, and offline queues are not replayed as team or battle contributions.
- Local migration, typecheck, tests, build, and local-preview checks pass; no remote D1 or deployment changes.

### Working notes
- User approved battle territory scoring as team area change from battle start to end, including losses, with old area excluded.
- User approved treating all existing territories as personal and best-effort migration of existing distance.
- User wants the app itself unavailable offline. Current app stores offline run/push-up/meal queues; these must not auto-sync under the new policy.
- Current territory distances are aggregated into mutable territory polygons; add run-level records as the authoritative source for distance.
- Current territory updates can change ownership geometry; keep the personal and team layers isolated so personal mode cannot alter team battle area.
- Team battle scoring coefficients are adjustable but must be snapshotted per battle so an active battle's rules cannot change mid-event.
- Personal distance includes runs in either mode; team distance and battle eligibility are based on mode/team snapshots.

### Checklist
- [ ] Define shared Zod schemas for activity modes, run summaries, distance/area battle scores, and adjustable scoring settings.
- [ ] Add additive D1 migrations for run-level distance records, battle score events/baselines, and legacy territory/distance treatment.
- [ ] Implement authenticated online run recording with immutable mode/team attribution and idempotency.
- [ ] Separate personal and team territory mutations; preserve same-team cross-member union and unique area accounting.
- [ ] Implement battle distance and net-area scoring restricted to the accepted roster and battle window; remove push-up battle scoring.
- [ ] Add APIs for home/team profile distance summaries, current uniforms, battle score rates, and member visibility.
- [ ] Update run-mode/uniform UI, home and team member summaries, and battle scoreboard; de-emphasize strength-training UI without destructive data deletion.
- [ ] Add an app-wide online-required gate and prevent legacy offline queues from syncing.
- [ ] Add schema, API, territory, scoring, privacy, and offline regression tests.
- [ ] Apply migrations to local D1 only; run typecheck, tests, build, and preview checks.
- [ ] Record results and remaining caveats.

## Running-only missions and territory fortification removal

### Goal and acceptance criteria
- Daily missions are created and progressed only by completed online running sessions with positive distance.
- A running mission grants XP only; exercise and meal-analysis features remain usable but grant no XP, achievements, or mission rewards.
- Territory overlap always uses the same normal area subtraction, regardless of legacy fortification values.
- Remove fortification UI and claim flow without deleting the legacy database column or existing user records.
- Preserve running, team battles, territory merging, and the pending ranking text-search changes.

### Checklist
- [x] Update shared mission contract and backend mission lifecycle.
- [x] Remove fortification-dependent territory capture and merge behavior.
- [x] Remove fortification and non-running reward UI; keep exercise and meal analysis available.
- [x] Add/adjust regression tests and run typecheck, tests, build, and preview checks.
- [ ] Review diff, commit with the existing author metadata, push, and verify deployment workflow.

### Results
- Daily mission progress now comes only from a completed online run with positive distance. Claiming it grants 100 XP; push-up logging and meal analysis remain available but do not grant XP, achievements, or mission progress.
- Removed fortification effects and related UI. Territory overlap/capture follows the normal geometry rules; legacy DB columns and historical user records are preserved.
- Preserved the in-progress ranking text search and included its files in the same pending change set.
- `npm run typecheck`, `npx vitest run` (28 tests), `npm run build`, and local preview HTTP checks pass. Build reports the existing mixed-import and large-chunk warnings. No schema change was required, so no D1 migration was added.
- `packages/backend/wrangler.toml` contains a plaintext API-key-like setting. It was not changed or included; if that value has been pushed to a public remote, rotate it.

## Lifetime running titles

### Acceptance criteria and working notes
- Use personal lifetime distance, including completed personal/team runs and the existing legacy-distance carryover.
- Award the agreed 12 titles at 1, 5, 10, 25, 50, 100, 200, 300, 500, 750, 1,000, and 2,000 km.
- Before 1 km, show no earned title and progress toward the first title. Keep the highest title beyond 2,000 km.
- Show the current title, next target, and progress on Home; show member titles and their profile progress within the existing team visibility scope.
- Derive titles from the already-persisted lifetime distance; no new D1 migration or reward changes are needed.
- Commit and push using the preceding commit's author identity, then propose higher titles without implementing unapproved thresholds.

### Checklist
- [x] Inspect repository rules, lifetime-distance aggregation, and profile UI.
- [x] Implement shared title schemas/definitions, progress logic, and responsive profile displays.
- [x] Verify all milestone boundaries, initial/max states, typecheck, build, tests, and UI rendering.
- [x] Review the verified change set for delivery. Commit/push and workflow status are reported with the delivery.

### Results
- The shared definitions drive both Home and team-member views from persistent lifetime distance. No database migration is required.
- Initial typecheck, build, and all 61 tests passed, including 33 title/progress tests.
- Headless browser checks cover initial titles, exact milestones, maximum/above-maximum distance, 12-title expansion, info hints, and viewport widths 320/390/768/1365.
- Visual review caught a member-profile dialog positioned relative to a filtered ancestor; moved that dialog to a body portal and retained viewport-bounded scrolling.
- Final typecheck and full workspace build passed after the dialog correction. The existing mixed-import and bundle-size warnings remain.
- The final browser checks passed for six distance states, all four widths, expanded milestones, hint open/close, team badges, profile open/close, and vertical close-button bounds at 320px. No page JavaScript errors were recorded.
